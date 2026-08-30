from django.utils import timezone
from django.db import transaction
from django.core.exceptions import PermissionDenied, ValidationError
from django.contrib.auth.models import User
from workspace.models import Workspace
from task.models import WorkspaceRequest, RequestEvent
from .notification_service import NotificationService


class RequestStateError(ValidationError):
    """Raised when an invalid state transition is attempted on a WorkspaceRequest."""
    pass


class RequestService:
    """
    Authoritative state machine and lifecycle manager for WorkspaceRequests.

    Enforces:
    - Strict state transitions (SUBMITTED -> UNDER_REVIEW -> ESCALATED -> APPROVED/REJECTED).
    - Actor authorization (Owners can approve/reject/archive, Admins can review/escalate/reject, Members can create/view own).
    - Immutable RequestEvent audit timeline creation on every milestone.
    - Automated notification dispatching to relevant workspace actors.
    - Decoupling of decision status (APPROVED) from execution status (COMPLETED/FAILED).
    """

    VALID_DECISION_TRANSITIONS = {
        'SUBMITTED': ['UNDER_REVIEW', 'ESCALATED', 'APPROVED', 'REJECTED'],
        'UNDER_REVIEW': ['ESCALATED', 'APPROVED', 'REJECTED'],
        'ESCALATED': ['APPROVED', 'REJECTED'],
        'APPROVED': [], # Terminal decision state
        'REJECTED': [], # Terminal decision state
    }

    @staticmethod
    def _resolve_user_role(workspace: Workspace, user: User) -> str:
        if not user or not workspace:
            return 'SYSTEM'
        if workspace.owner == user:
            return 'OWNER'
        membership = workspace.memberships.filter(user=user).first()
        if membership:
            return membership.role
        return 'VIEWER'

    @classmethod
    def create_request(
        cls,
        workspace: Workspace,
        requester: User,
        request_type: str,
        title: str,
        description: str = "",
        payload: dict = None
    ) -> WorkspaceRequest:
        """
        Creates a new WorkspaceRequest in SUBMITTED state, logs a CREATED timeline event,
        and notifies workspace admins and owner.
        """
        if not workspace.owner == requester and not workspace.memberships.filter(user=requester).exists():
            raise PermissionDenied("You are not a member of this workspace.")

        actor_role = cls._resolve_user_role(workspace, requester)
        if actor_role == 'VIEWER':
            raise PermissionDenied("Read-only VIEWER role cannot submit requests.")

        with transaction.atomic():
            req = WorkspaceRequest.objects.create(
                workspace=workspace,
                requester=requester,
                request_type=request_type,
                title=title,
                description=description,
                payload=payload or {},
                decision_status='SUBMITTED',
                execution_status='NOT_STARTED'
            )

            # Record creation event
            RequestEvent.objects.create(
                request=req,
                actor=requester,
                actor_role=actor_role,
                event_type='CREATED',
                from_status='',
                to_status='SUBMITTED',
                message=f"Request {req.display_id} created by {requester.username}.",
                is_internal=False,
                metadata={"request_type": request_type}
            )

            # Dispatch notification to admins and owner
            NotificationService.notify_workspace_admins_and_owner(
                workspace=workspace,
                notification_type='NEW_REQUEST',
                title='New Request Submitted',
                message=f"New {req.get_request_type_display()} '{req.title}' ({req.display_id}) submitted by {requester.username}.",
                request=req,
                action_url=f"/review-center?request_id={req.id}",
                exclude_user=requester
            )

        return req

    @classmethod
    def start_review(cls, request: WorkspaceRequest, reviewer: User) -> WorkspaceRequest:
        """
        Transitions request from SUBMITTED to UNDER_REVIEW when opened by Admin/Owner.
        """
        actor_role = cls._resolve_user_role(request.workspace, reviewer)
        if actor_role not in ['ADMIN', 'OWNER']:
            raise PermissionDenied("Only workspace ADMIN or OWNER can review requests.")

        if request.decision_status == 'SUBMITTED':
            with transaction.atomic():
                old_status = request.decision_status
                request.decision_status = 'UNDER_REVIEW'
                request.reviewer = reviewer
                request.reviewed_at = timezone.now()
                request.save()

                RequestEvent.objects.create(
                    request=request,
                    actor=reviewer,
                    actor_role=actor_role,
                    event_type='REVIEW_STARTED',
                    from_status=old_status,
                    to_status='UNDER_REVIEW',
                    message=f"Review initiated by {reviewer.username}.",
                    is_internal=True
                )

        return request

    @classmethod
    def escalate_request(cls, request: WorkspaceRequest, actor: User, reason: str) -> WorkspaceRequest:
        """
        Admin escalates a request to the Workspace Owner. Requires a non-empty escalation reason.
        """
        if not reason or not reason.strip():
            raise RequestStateError("An escalation reason is required to escalate a request.")

        actor_role = cls._resolve_user_role(request.workspace, actor)
        if actor_role not in ['ADMIN', 'OWNER']:
            raise PermissionDenied("Only workspace ADMIN or OWNER can escalate requests.")

        allowed = cls.VALID_DECISION_TRANSITIONS.get(request.decision_status, [])
        if 'ESCALATED' not in allowed:
            raise RequestStateError(
                f"Cannot escalate request in '{request.decision_status}' status."
            )

        with transaction.atomic():
            old_status = request.decision_status
            request.decision_status = 'ESCALATED'
            request.escalated_by = actor
            request.escalated_at = timezone.now()
            request.escalation_reason = reason.strip()
            request.save()

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role=actor_role,
                event_type='ESCALATED',
                from_status=old_status,
                to_status='ESCALATED',
                message=f"Escalated to Owner by {actor.username}. Reason: {reason.strip()}",
                is_internal=False,
                metadata={"reason": reason.strip()}
            )

            # Dispatch notification to Workspace Owner
            NotificationService.notify_workspace_owner(
                workspace=request.workspace,
                notification_type='REQUEST_ESCALATED',
                title='Request Escalated for Owner Approval',
                message=f"{request.display_id} was escalated to you by {actor.username}: {reason.strip()}",
                request=request,
                action_url=f"/review-center?request_id={request.id}"
            )

        return request

    @classmethod
    def approve_request(cls, request: WorkspaceRequest, actor: User, reason: str = "") -> WorkspaceRequest:
        """
        Approves a request (Owner or authorized Admin).
        """
        actor_role = cls._resolve_user_role(request.workspace, actor)
        if actor_role not in ['ADMIN', 'OWNER']:
            raise PermissionDenied("Only workspace ADMIN or OWNER can approve requests.")

        allowed = cls.VALID_DECISION_TRANSITIONS.get(request.decision_status, [])
        if 'APPROVED' not in allowed:
            raise RequestStateError(
                f"Cannot approve request in '{request.decision_status}' status."
            )

        with transaction.atomic():
            old_status = request.decision_status
            request.decision_status = 'APPROVED'
            request.reviewer = actor
            request.reviewed_at = timezone.now()
            request.decision_reason = reason.strip() if reason else ""
            request.save()

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role=actor_role,
                event_type='APPROVED',
                from_status=old_status,
                to_status='APPROVED',
                message=f"Request approved by {actor.username}." + (f" Note: {reason.strip()}" if reason else ""),
                is_internal=False,
                metadata={"reason": reason.strip() if reason else ""}
            )

            # Dispatch notification to Requester
            NotificationService.notify_user(
                workspace=request.workspace,
                recipient=request.requester,
                notification_type='REQUEST_APPROVED',
                title='Request Approved',
                message=f"Your request {request.display_id} ('{request.title}') has been approved.",
                request=request,
                action_url=f"/my-requests?request_id={request.id}"
            )

        return request

    @classmethod
    def reject_request(cls, request: WorkspaceRequest, actor: User, reason: str) -> WorkspaceRequest:
        """
        Rejects a request. Rejection requires an explicit reason visible to the requester.
        """
        if not reason or not reason.strip():
            raise RequestStateError("A reason is required to reject a request.")

        actor_role = cls._resolve_user_role(request.workspace, actor)
        if actor_role not in ['ADMIN', 'OWNER']:
            raise PermissionDenied("Only workspace ADMIN or OWNER can reject requests.")

        allowed = cls.VALID_DECISION_TRANSITIONS.get(request.decision_status, [])
        if 'REJECTED' not in allowed:
            raise RequestStateError(
                f"Cannot reject request in '{request.decision_status}' status."
            )

        with transaction.atomic():
            old_status = request.decision_status
            request.decision_status = 'REJECTED'
            request.reviewer = actor
            request.reviewed_at = timezone.now()
            request.decision_reason = reason.strip()
            request.save()

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role=actor_role,
                event_type='REJECTED',
                from_status=old_status,
                to_status='REJECTED',
                message=f"Request rejected by {actor.username}. Reason: {reason.strip()}",
                is_internal=False,
                metadata={"reason": reason.strip()}
            )

            # Dispatch notification to Requester
            NotificationService.notify_user(
                workspace=request.workspace,
                recipient=request.requester,
                notification_type='REQUEST_REJECTED',
                title='Request Rejected',
                message=f"Your request {request.display_id} was rejected. Reason: {reason.strip()}",
                request=request,
                action_url=f"/my-requests?request_id={request.id}"
            )

        return request

    @classmethod
    def record_execution_start(cls, request: WorkspaceRequest, actor: User = None) -> WorkspaceRequest:
        """
        Marks execution as RUNNING for an APPROVED request.
        """
        if request.decision_status != 'APPROVED':
            raise RequestStateError("Cannot execute request that has not been approved.")

        with transaction.atomic():
            request.execution_status = 'RUNNING'
            request.save()

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role=cls._resolve_user_role(request.workspace, actor),
                event_type='EXECUTION_STARTED',
                from_status='NOT_STARTED',
                to_status='RUNNING',
                message="Authorized execution operation started.",
                is_internal=False
            )

        return request

    @classmethod
    def record_execution_evidence(
        cls,
        request: WorkspaceRequest,
        evidence: dict,
        result: dict = None,
        success: bool = True,
        actor: User = None
    ) -> WorkspaceRequest:
        """
        Stores authoritative execution evidence and result on the request.
        Updates execution_status to COMPLETED (if success) or FAILED.
        """
        if request.decision_status != 'APPROVED':
            raise RequestStateError("Cannot record execution evidence for an unapproved request.")

        with transaction.atomic():
            old_exec_status = request.execution_status
            request.execution_status = 'COMPLETED' if success else 'FAILED'
            request.execution_evidence = evidence or {}
            request.execution_result = result or {}
            request.save()

            event_type = 'EXECUTION_COMPLETED' if success else 'EXECUTION_FAILED'
            msg = (
                f"Execution successfully completed with evidence: {evidence}"
                if success
                else f"Execution failed: {result}"
            )

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role=cls._resolve_user_role(request.workspace, actor),
                event_type=event_type,
                from_status=old_exec_status,
                to_status=request.execution_status,
                message=msg,
                is_internal=False,
                metadata={"evidence": evidence, "result": result, "success": success}
            )

            # Notify requester of completion or failure
            notif_type = 'REQUEST_COMPLETED' if success else 'REQUEST_FAILED'
            notif_title = 'Request Execution Completed' if success else 'Request Execution Failed'
            notif_msg = (
                f"Your request {request.display_id} has been fulfilled with confirmed evidence."
                if success
                else f"Execution for your approved request {request.display_id} encountered an issue."
            )
            NotificationService.notify_user(
                workspace=request.workspace,
                recipient=request.requester,
                notification_type=notif_type,
                title=notif_title,
                message=notif_msg,
                request=request,
                action_url=f"/my-requests?request_id={request.id}"
            )

        return request

    @classmethod
    def archive_request(cls, request: WorkspaceRequest, actor: User) -> WorkspaceRequest:
        """
        Soft-deletes / archives a request (Workspace Owner only). Preserves audit timeline.
        """
        actor_role = cls._resolve_user_role(request.workspace, actor)
        if actor_role != 'OWNER':
            raise PermissionDenied("Only the workspace OWNER can archive/delete requests.")

        with transaction.atomic():
            request.is_archived = True
            request.save()

            RequestEvent.objects.create(
                request=request,
                actor=actor,
                actor_role='OWNER',
                event_type='ARCHIVED',
                message=f"Request archived by Owner {actor.username}.",
                is_internal=True
            )

        return request
