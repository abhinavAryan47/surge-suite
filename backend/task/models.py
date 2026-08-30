import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from workspace.models import Workspace

class Agent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    provider = models.CharField(max_length=100) # e.g. 'gemini', 'simulated'
    model = models.CharField(max_length=100)    # e.g. 'gemini-1.5-flash', 'dev-mock'
    capabilities = models.JSONField(default=list)  # list of strings e.g. ["research"]
    status = models.CharField(
        max_length=50,
        choices=[('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')],
        default='ACTIVE'
    )
    configuration = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.provider}/{self.model})"

class Task(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='tasks')
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_tasks')
    problem_statement = models.TextField()
    assigned_agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tasks')
    status = models.CharField(
        max_length=50,
        choices=[
            ('PENDING', 'Pending'),
            ('RUNNING', 'Running'),
            ('WAITING_FOR_APPROVAL', 'Waiting for Approval'),
            ('COMPLETED', 'Completed'),
            ('FAILED', 'Failed')
        ],
        default='PENDING'
    )
    result = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Task {self.id} - {self.status}"

class TaskExecution(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='executions')
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='executions')
    status = models.CharField(
        max_length=50,
        choices=[
            ('PENDING', 'Pending'),
            ('RUNNING', 'Running'),
            ('WAITING_FOR_APPROVAL', 'Waiting for Approval'),
            ('COMPLETED', 'Completed'),
            ('FAILED', 'Failed')
        ],
        default='PENDING'
    )
    mode = models.CharField(
        max_length=50,
        choices=[('REAL', 'Real'), ('SIMULATED', 'Simulated')],
        default='SIMULATED'
    )
    provider = models.CharField(max_length=100, null=True, blank=True)
    model = models.CharField(max_length=100, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    result = models.TextField(blank=True, null=True)
    error = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Execution {self.id} (Task: {self.task_id})"

class Action(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    execution = models.ForeignKey(TaskExecution, on_delete=models.CASCADE, related_name='actions')
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='actions')
    action_type = models.CharField(max_length=100) # e.g. 'generate_response'
    status = models.CharField(
        max_length=50,
        choices=[
            ('PENDING', 'Pending'),
            ('RUNNING', 'Running'),
            ('COMPLETED', 'Completed'),
            ('FAILED', 'Failed')
        ],
        default='PENDING'
    )
    input_data = models.JSONField(default=dict, blank=True)
    output_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Action {self.action_type} - {self.status}"

class ExecutionEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='events')
    execution = models.ForeignKey(TaskExecution, on_delete=models.CASCADE, null=True, blank=True, related_name='events')
    event_type = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Event {self.event_type} at {self.timestamp}"

class UserProviderCredential(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='provider_credentials')
    provider = models.CharField(max_length=100) # lowercase e.g., 'gemini', 'groq'
    encrypted_api_key = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'provider')

    def __str__(self):
        return f"{self.user.username} - {self.provider}"


class UserMCPServer(models.Model):
    """Model representing a user-configured MCP server.

    Fields:
        user: Owner of the MCP configuration.
        name: Unique name for the MCP server within the user's scope.
        description: Optional human‑readable description.
        configuration: Full configuration dict (command, env vars, etc.).
        is_enabled: Whether the server participates in relevance selection.
        tools_metadata: Cached list of tools exposed by this server.
        created_at / updated_at: Timestamps.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mcp_servers')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    configuration = models.JSONField(default=dict, blank=True)
    is_enabled = models.BooleanField(default=True)
    tools_metadata = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'name')

    def __str__(self):
        return f"{self.name} (User: {self.user.username})"




class HumanApprovalRequest(models.Model):
    """
    Represents a request for human authorization before executing a shell command
    that falls under the REQUIRES_APPROVAL security tier.

    Approval is strictly scoped: command, task, execution, and workspace are
    all captured at creation time and re-verified before any execution.
    """
    APPROVAL_STATUSES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('DENIED', 'Denied'),
        ('EXPIRED', 'Expired'),
        ('CANCELLED', 'Cancelled'),
    ]
    RISK_LEVELS = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Relationships — all required for cross-validation
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='approval_requests')
    execution = models.ForeignKey(TaskExecution, on_delete=models.CASCADE, related_name='approval_requests')
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='approval_requests')
    requested_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='submitted_approvals'
    )
    action = models.ForeignKey(
        Action, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_requests'
    )

    # Command storage — immutable after creation
    command = models.TextField()                    # exact, raw command (never shown to frontend)
    sanitized_display_command = models.TextField()  # secrets-redacted display version

    # Human-readable context
    reason = models.TextField(blank=True)  # why the agent wants to run this
    risk = models.CharField(max_length=20, choices=RISK_LEVELS, default='MEDIUM')

    # Lifecycle
    status = models.CharField(max_length=30, choices=APPROVAL_STATUSES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resolved_approvals'
    )

    # Execution result (populated after approved execution)
    execution_result = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['task', 'status']),
            models.Index(fields=['execution', 'status']),
        ]
        # Prevent more than one PENDING approval per execution at a time
        constraints = [
            models.UniqueConstraint(
                fields=['execution'],
                condition=models.Q(status='PENDING'),
                name='unique_pending_approval_per_execution'
            )
        ]

    def is_expired(self):
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        return False

    def __str__(self):
        return f"ApprovalRequest {self.id} [{self.status}] - {self.sanitized_display_command[:60]}"


class CertificateRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='certificate_requests')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='certificate_requests')
    certificate_type = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ('PENDING', 'Pending'),
            ('PROCESSING', 'Processing'),
            ('READY', 'Ready'),
            ('REJECTED', 'Rejected'),
            ('CANCELLED', 'Cancelled'),
            ('COMPLETED', 'Completed')
        ],
        default='PENDING'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"CertificateRequest {self.id} [{self.status}]"


class MaintenanceTicket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='maintenance_tickets')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='maintenance_tickets')
    category = models.CharField(max_length=100)
    description = models.TextField()
    location = models.CharField(max_length=255)
    status = models.CharField(
        max_length=50,
        choices=[
            ('OPEN', 'Open'),
            ('ASSIGNED', 'Assigned'),
            ('IN_PROGRESS', 'In Progress'),
            ('RESOLVED', 'Resolved'),
            ('CLOSED', 'Closed'),
            ('ESCALATED', 'Escalated')
        ],
        default='OPEN'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"MaintenanceTicket {self.id} [{self.status}]"


class LaboratoryBooking(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='lab_bookings')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lab_bookings')
    lab_name = models.CharField(max_length=255)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=50, default='CONFIRMED')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"LaboratoryBooking {self.id} [{self.status}]"


class GrievanceEscalation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='grievances')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='grievances')
    subject = models.CharField(max_length=255)
    description = models.TextField()
    department = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=50,
        choices=[
            ('OPEN', 'Open'),
            ('IN_PROGRESS', 'In Progress'),
            ('ESCALATED', 'Escalated'),
            ('RESOLVED', 'Resolved'),
            ('CLOSED', 'Closed')
        ],
        default='OPEN'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"GrievanceEscalation {self.id} [{self.status}]"


class InstitutionalPolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='policies')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    rules = models.JSONField(default=dict, blank=True)
    effect = models.CharField(
        max_length=50,
        choices=[
            ('ALLOW', 'Allow'),
            ('DENY', 'Deny'),
            ('REQUIRES_APPROVAL', 'Requires Approval'),
            ('ESCALATE', 'Escalate')
        ],
        default='ALLOW'
    )
    priority = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-priority', '-created_at']

    def __str__(self):
        return f"Policy {self.name} [{self.effect}]"


class WorkspaceRequest(models.Model):
    """
    Unified, persistent Request / Case entity for all human-in-the-loop workflows.
    Bridges Member -> AI -> Review -> Approval/Rejection/Escalation -> Execution -> Evidence.
    """
    REQUEST_TYPES = [
        ('GRIEVANCE', 'Grievance'),
        ('CERTIFICATE', 'Certificate Request'),
        ('MAINTENANCE', 'Maintenance Ticket'),
        ('LAB_BOOKING', 'Laboratory Booking'),
        ('GENERAL', 'General Request'),
    ]

    DECISION_STATUSES = [
        ('SUBMITTED', 'Submitted'),
        ('UNDER_REVIEW', 'Under Review'),
        ('ESCALATED', 'Escalated'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    EXECUTION_STATUSES = [
        ('NOT_STARTED', 'Not Started'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_id = models.CharField(max_length=50, unique=True, db_index=True)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='workspace_requests')
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name='submitted_requests')

    request_type = models.CharField(max_length=50, choices=REQUEST_TYPES, default='GENERAL')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)

    decision_status = models.CharField(max_length=50, choices=DECISION_STATUSES, default='SUBMITTED')
    execution_status = models.CharField(max_length=50, choices=EXECUTION_STATUSES, default='NOT_STARTED')

    reviewer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_requests')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.TextField(blank=True)

    escalated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='escalated_requests')
    escalated_at = models.DateTimeField(null=True, blank=True)
    escalation_reason = models.TextField(blank=True)

    execution_result = models.JSONField(null=True, blank=True)
    execution_evidence = models.JSONField(null=True, blank=True)

    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['workspace', 'decision_status']),
            models.Index(fields=['workspace', 'requester']),
            models.Index(fields=['workspace', 'is_archived']),
            models.Index(fields=['display_id']),
        ]

    def save(self, *args, **kwargs):
        if not self.display_id:
            year = timezone.now().year
            prefix = f"REQ-{year}-"
            last_req = WorkspaceRequest.objects.filter(display_id__startswith=prefix).order_by('-display_id').first()
            if last_req and last_req.display_id:
                try:
                    last_num = int(last_req.display_id.split('-')[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = WorkspaceRequest.objects.filter(created_at__year=year).count() + 1
            else:
                next_num = 1
            self.display_id = f"REQ-{year}-{next_num:06d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.display_id} [{self.request_type}] - {self.decision_status}"


class RequestEvent(models.Model):
    """
    Immutable audit trail event for every transition or milestone in a WorkspaceRequest's lifecycle.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(WorkspaceRequest, on_delete=models.CASCADE, related_name='timeline_events')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='request_events')
    actor_role = models.CharField(max_length=50, default='SYSTEM')
    event_type = models.CharField(max_length=50) # CREATED, CLASSIFIED, REVIEW_STARTED, ESCALATED, APPROVED, REJECTED, EXECUTION_STARTED, EXECUTION_COMPLETED, EXECUTION_FAILED, ARCHIVED
    from_status = models.CharField(max_length=50, blank=True, default='')
    to_status = models.CharField(max_length=50, blank=True, default='')
    message = models.TextField(blank=True)
    is_internal = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['request', 'created_at']),
        ]

    def __str__(self):
        return f"{self.event_type} on {self.request.display_id} at {self.created_at}"


class WorkspaceNotification(models.Model):
    """
    Workspace-scoped notification for member, admin, and owner event dispatching.
    """
    NOTIFICATION_TYPES = [
        ('NEW_REQUEST', 'New Request'),
        ('REQUEST_ESCALATED', 'Request Escalated'),
        ('REQUEST_APPROVED', 'Request Approved'),
        ('REQUEST_REJECTED', 'Request Rejected'),
        ('REQUEST_COMPLETED', 'Request Completed'),
        ('REQUEST_FAILED', 'Request Failed'),
        ('GENERAL', 'General Notification'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='notifications')
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspace_notifications')
    request = models.ForeignKey(WorkspaceRequest, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')

    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES, default='GENERAL')
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    action_url = models.CharField(max_length=500, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['workspace', 'recipient', 'is_read']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Notification to {self.recipient.username}: {self.title} [{self.workspace.name}]"

