"""
Phase 4.7 — Human-in-the-Loop Shell Authorization

ApprovalService:  resolve_approve() and resolve_deny()

Both methods:
- Validate the approval request is PENDING, not expired, belongs to the correct task/workspace/execution.
- Verify the resolving user has workspace access.
- Re-classify the exact stored command immediately before any execution.
- Delegate to ExecutionService.resume_from_approval() after recording events.
"""

from django.utils import timezone
from django.core.exceptions import PermissionDenied

from task.models import Task, TaskExecution, HumanApprovalRequest, ExecutionEvent
from .execution_service import ExecutionService
from .capability_registry import CapabilityRegistry


class ApprovalValidationError(Exception):
    """Raised when an approval request fails validation."""
    pass


class ApprovalService:
    """
    Handles the approval lifecycle for human-in-the-loop shell authorization.

    Security guarantees:
    - Command is re-classified immediately before execution (never trust stored classification).
    - BLOCKED commands remain BLOCKED even if a PENDING approval exists.
    - Resolving user must be authenticated and have workspace access.
    - An approval can only be resolved once (PENDING → APPROVED or DENIED).
    - Expired approvals cannot be executed.
    """

    def _validate_approval(self, approval_id: str, task_id: str, resolving_user) -> HumanApprovalRequest:
        """
        Load and validate a HumanApprovalRequest.

        Raises ApprovalValidationError if any check fails.
        """
        try:
            approval = HumanApprovalRequest.objects.select_related(
                'task', 'execution', 'workspace', 'task__workspace'
            ).get(id=approval_id)
        except HumanApprovalRequest.DoesNotExist:
            raise ApprovalValidationError("Approval request not found.")

        # Must belong to the specified task
        if str(approval.task.id) != str(task_id):
            raise ApprovalValidationError("Approval request does not belong to the specified task.")

        # Must still be PENDING
        if approval.status != 'PENDING':
            raise ApprovalValidationError(
                f"Approval request is no longer pending (current status: {approval.status})."
            )

        # Must not be expired
        if approval.is_expired():
            # Mark as expired in DB
            approval.status = 'EXPIRED'
            approval.resolved_at = timezone.now()
            approval.save()
            raise ApprovalValidationError("Approval request has expired.")

        # Resolving user must have workspace access
        workspace = approval.workspace
        if workspace.owner != resolving_user:
            if not workspace.memberships.filter(user=resolving_user).exists():
                raise ApprovalValidationError(
                    "You do not have access to this workspace."
                )

        return approval

    def _record_event(self, approval, event_type: str, extra_meta: dict = None):
        """Helper to create an ExecutionEvent safely."""
        meta = {
            'approval_id': str(approval.id),
            'command': approval.sanitized_display_command,
        }
        if extra_meta:
            meta.update(extra_meta)
        ExecutionEvent.objects.create(
            task=approval.task,
            execution=approval.execution,
            event_type=event_type,
            metadata=meta
        )

    def resolve_approve(self, approval_id: str, task_id: str, resolving_user) -> TaskExecution:
        """
        Approve a pending shell command and resume agentic execution.

        Steps:
        1. Validate the approval (ownership, status, expiry).
        2. Re-classify the exact stored command immediately.
        3. If BLOCKED → fail safely, do NOT execute.
        4. If REQUIRES_APPROVAL → execute using CapabilityRegistry.
        5. Store result, update approval lifecycle, record events.
        6. Resume execution via ExecutionService.resume_from_approval().

        Args:
            approval_id:    UUID of the HumanApprovalRequest.
            task_id:        PK of the parent Task.
            resolving_user: Authenticated User approving the request.

        Returns:
            The updated TaskExecution.

        Raises:
            ApprovalValidationError: If the approval is invalid or the command is BLOCKED.
        """
        approval = self._validate_approval(approval_id, task_id, resolving_user)
        task = approval.task
        execution = approval.execution

        # Check if the approval was for an MCP/builtin tool rather than bash.execute
        is_mcp_or_builtin_tool = False
        tool_name = "bash.execute"
        tool_args = {"command": approval.command}
        
        if approval.action and approval.action.input_data:
            input_data = approval.action.input_data
            if "tool_name" in input_data:
                tool_name = input_data["tool_name"]
                tool_args = input_data.get("arguments", {})
                if tool_name != "bash.execute":
                    is_mcp_or_builtin_tool = True

        if is_mcp_or_builtin_tool:
            from .mcp.registry import MCPRegistry
            
            mcp_registry = MCPRegistry(user=task.creator, workspace=task.workspace)
            required_mcp_servers = ExecutionService()._determine_required_mcp_servers(task.problem_statement, user=task.creator, is_real=True)
            mcp_tools = []
            if required_mcp_servers:
                mcp_registry.initialize_servers(server_names=required_mcp_servers, user=task.creator)
                mcp_tools = mcp_registry.discover_tools()
                
            is_mcp = any(t['name'] == tool_name for t in mcp_tools)
            
            try:
                if is_mcp:
                    tool_result = mcp_registry.execute_tool(tool_name, tool_args, approved=True)
                else:
                    builtin_registry = CapabilityRegistry()
                    tool_result = builtin_registry.execute_tool(tool_name, tool_args)
            except Exception as e:
                tool_result = {"error": f"Exception executing approved tool: {str(e)}"}
        else:
            # Re-classify the EXACT stored command before any execution
            registry = CapabilityRegistry()
            tier = registry._classify_command(approval.command)

            if tier == "BLOCKED":
                # The command escalated to BLOCKED since the approval was created.
                # Mark it as denied and record a security event.
                approval.status = 'DENIED'
                approval.resolved_at = timezone.now()
                approval.resolved_by = resolving_user
                approval.save()

                self._record_event(approval, 'APPROVAL_SECURITY_BLOCKED', {
                    'reason': 'Command was re-classified as BLOCKED immediately before execution. Not executed.'
                })

                # Mark task/execution FAILED — the approved-but-blocked command cannot proceed.
                execution.status = 'FAILED'
                execution.error = 'Approved command was classified as BLOCKED during pre-execution re-validation.'
                execution.completed_at = timezone.now()
                execution.save()
                task.status = 'FAILED'
                task.result = 'The approved shell command was blocked by the security policy during re-validation and was not executed.'
                task.save()

                raise ApprovalValidationError(
                    "The command has been blocked by the security policy and cannot be executed."
                )

            if tier == "SAFE":
                # Edge case: the command was downgraded to SAFE since request creation.
                # Still execute it, but note the tier change.
                pass

            # Execute the exact stored command
            try:
                tool_result = registry.handle_bash_execute({'command': approval.command}, approved=True)
            except PermissionDenied as e:
                # Execution blocked at runtime
                approval.status = 'DENIED'
                approval.resolved_at = timezone.now()
                approval.resolved_by = resolving_user
                approval.save()
                self._record_event(approval, 'APPROVAL_SECURITY_BLOCKED', {
                    'reason': f'Runtime permission denied: {str(e)}'
                })
                raise ApprovalValidationError(f"Execution blocked by security policy: {str(e)}")

        # Store the execution result on the approval record
        # Use sanitized_display_command for the stored result key (never raw command in result)
        if is_mcp_or_builtin_tool:
            approval.execution_result = {
                'exit_code': 0 if "error" not in tool_result else 1,
                'stdout': (tool_result.get('result') or '')[:5000],
                'stderr': '',
                'error': tool_result.get('error'),
            }
        else:
            approval.execution_result = {
                'exit_code': tool_result.get('exit_code'),
                'stdout': (tool_result.get('stdout') or '')[:5000],
                'stderr': (tool_result.get('stderr') or '')[:2000],
                'error': tool_result.get('error'),
            }
        approval.status = 'APPROVED'
        approval.resolved_at = timezone.now()
        approval.resolved_by = resolving_user
        approval.save()

        # Record approval events
        self._record_event(approval, 'APPROVAL_APPROVED', {
            'resolved_by': resolving_user.username,
        })
        self._record_event(approval, 'APPROVAL_EXECUTED', {
            'exit_code': tool_result.get('exit_code'),
            'error': tool_result.get('error'),
            'result_summary': str(tool_result)[:200],
        })

        # Resume agentic execution
        execution_service = ExecutionService()
        return execution_service.resume_from_approval(
            task=task,
            execution=execution,
            approval=approval,
            tool_result_or_denial=tool_result,
            user=resolving_user,
            is_approved=True
        )

    def resolve_deny(self, approval_id: str, task_id: str, resolving_user) -> TaskExecution:
        """
        Deny a pending shell command and resume agentic execution with denial feedback.

        The command is NEVER executed.
        The agent receives explicit denial feedback and can adapt or conclude.

        Steps:
        1. Validate the approval (ownership, status, expiry).
        2. Mark approval DENIED.
        3. Record APPROVAL_DENIED event.
        4. Resume execution with denial feedback via ExecutionService.resume_from_approval().

        Args:
            approval_id:    UUID of the HumanApprovalRequest.
            task_id:        PK of the parent Task.
            resolving_user: Authenticated User denying the request.

        Returns:
            The updated TaskExecution.

        Raises:
            ApprovalValidationError: If the approval is invalid.
        """
        approval = self._validate_approval(approval_id, task_id, resolving_user)
        task = approval.task
        execution = approval.execution

        approval.status = 'DENIED'
        approval.resolved_at = timezone.now()
        approval.resolved_by = resolving_user
        approval.save()

        self._record_event(approval, 'APPROVAL_DENIED', {
            'resolved_by': resolving_user.username,
        })

        # Denial feedback message injected into the agent's conversation history
        denial_feedback = (
            "The user denied permission to execute the requested shell command. "
            f"Command that was requested (display form): `{approval.sanitized_display_command}`. "
            "Do not claim that the command was executed. "
            "Do not include results from a command that did not run. "
            "Adapt the task if possible, or clearly explain that the requested operation "
            "could not be completed because the user did not authorize it."
        )

        # Resume agentic execution with denial feedback
        execution_service = ExecutionService()
        return execution_service.resume_from_approval(
            task=task,
            execution=execution,
            approval=approval,
            tool_result_or_denial=denial_feedback,
            user=resolving_user,
            is_approved=False
        )
