from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Agent, Task, TaskExecution, Action, ExecutionEvent, HumanApprovalRequest, UserMCPServer,
    CertificateRequest, MaintenanceTicket, LaboratoryBooking, GrievanceEscalation, InstitutionalPolicy,
    WorkspaceRequest, RequestEvent, WorkspaceNotification
)

class TaskUserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='first_name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'name', 'email']


class AgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = [
            'id', 'name', 'description', 'provider', 'model', 
            'capabilities', 'status', 'configuration', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class ExecutionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExecutionEvent
        fields = ['id', 'event_type', 'timestamp', 'metadata']
        read_only_fields = ['id', 'timestamp']

class ActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Action
        fields = ['id', 'action_type', 'status', 'input_data', 'output_data', 'created_at', 'completed_at']
        read_only_fields = ['id', 'created_at', 'completed_at']

class TaskExecutionSerializer(serializers.ModelSerializer):
    actions = ActionSerializer(many=True, read_only=True)
    events = ExecutionEventSerializer(many=True, read_only=True)
    agent_details = AgentSerializer(source='agent', read_only=True)

    class Meta:
        model = TaskExecution
        fields = [
            'id', 'status', 'mode', 'started_at', 'completed_at', 
            'result', 'error', 'actions', 'events', 'agent_details',
            'provider', 'model'
        ]
        read_only_fields = ['id', 'started_at', 'completed_at']


class HumanApprovalRequestSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for HumanApprovalRequest.

    SECURITY:
    - `command` (raw) is intentionally EXCLUDED. Only sanitized_display_command is exposed.
    - execution_result is intentionally EXCLUDED to avoid leaking raw output to unauthorized users.
      It is used internally by the execution engine only.
    - resolved_by username is exposed for audit purposes (not the User object).
    """
    resolved_by_username = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = HumanApprovalRequest
        fields = [
            'id',
            'sanitized_display_command',  # secrets-redacted display version
            'reason',
            'risk',
            'status',
            'created_at',
            'expires_at',
            'resolved_at',
            'resolved_by_username',
            'is_expired',
        ]
        read_only_fields = fields

    def get_resolved_by_username(self, obj):
        if obj.resolved_by:
            return obj.resolved_by.username
        return None

    def get_is_expired(self, obj):
        return obj.is_expired()


class TaskSerializer(serializers.ModelSerializer):
    creator = TaskUserSerializer(read_only=True)
    assigned_agent_details = AgentSerializer(source='assigned_agent', read_only=True)
    executions = TaskExecutionSerializer(many=True, read_only=True)
    events = ExecutionEventSerializer(many=True, read_only=True)
    pending_approval = serializers.SerializerMethodField()
    walkthrough = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'workspace', 'creator', 'problem_statement', 
            'assigned_agent', 'assigned_agent_details', 'status', 
            'result', 'created_at', 'updated_at', 'executions', 'events',
            'pending_approval', 'walkthrough'
        ]
        read_only_fields = [
            'id', 'creator', 'status', 'result', 'created_at', 'updated_at',
            'executions', 'events', 'pending_approval', 'walkthrough'
        ]

    def get_pending_approval(self, obj):
        """
        Return the single PENDING approval request for this task, if any.
        Only returned when the task is WAITING_FOR_APPROVAL.
        Returns None otherwise.
        """
        if obj.status != 'WAITING_FOR_APPROVAL':
            return None
        approval = obj.approval_requests.filter(status='PENDING').first()
        if not approval:
            return None
        return HumanApprovalRequestSerializer(approval).data

    def get_walkthrough(self, obj):
        import os
        from django.conf import settings
        artifact_path = os.path.join(os.path.dirname(settings.BASE_DIR), '.surge', 'task-artifacts', str(obj.id), 'walkthrough.md')
        if os.path.exists(artifact_path):
            try:
                with open(artifact_path, 'r', encoding='utf-8') as f:
                    return f.read()
            except Exception:
                pass
        return None

    def validate_workspace(self, value):
        user = self.context['request'].user
        # Check membership/ownership on workspace
        if value.owner != user and not value.memberships.filter(user=user).exists():
            raise serializers.ValidationError("You do not have access to this workspace.")
        return value


class UserMCPServerSerializer(serializers.ModelSerializer):
    configuration = serializers.JSONField()

    class Meta:
        model = UserMCPServer
        fields = [
            'id', 'name', 'description', 'configuration', 
            'is_enabled', 'tools_metadata', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tools_metadata', 'created_at', 'updated_at']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        config = ret.get("configuration")
        if isinstance(config, dict) and "env" in config and isinstance(config["env"], dict):
            masked_env = {k: "••••••••" for k in config["env"]}
            ret["configuration"] = {
                **config,
                "env": masked_env
            }
        return ret

    def validate(self, data):
        configuration = data.get("configuration")
        if configuration:
            from .utils.mcp_validator import validate_mcp_config, test_handshake_and_discover_tools
            from django.core.exceptions import ValidationError as DjangoValidationError
            
            new_env = configuration.get("env", {}) or {}
            old_env = {}
            if self.instance:
                old_config = self.instance.configuration or {}
                old_env = old_config.get("env", {}) or {}
                
            resolved_env = {}
            for k, v in new_env.items():
                if v == "••••••••":
                    resolved_env[k] = old_env.get(k, "")
                else:
                    resolved_env[k] = v
                    
            handshake_config = {
                **configuration,
                "env": resolved_env
            }
            
            # Validate command structure and security restrictions
            try:
                validate_mcp_config(handshake_config)
            except DjangoValidationError as e:
                raise serializers.ValidationError({"configuration": e.message if hasattr(e, 'message') else str(e)})
                
            # Perform handshake check (which also discovers tools)
            try:
                tools = test_handshake_and_discover_tools(handshake_config)
                # Store tools metadata in validation step
                data["tools_metadata"] = tools
            except DjangoValidationError as e:
                raise serializers.ValidationError({"configuration": f"Handshake failed: {e.message if hasattr(e, 'message') else str(e)}"})
                
            # Save resolved config back into validated data
            data["configuration"] = handshake_config
            
        return data


class CertificateRequestSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = CertificateRequest
        fields = ['id', 'workspace', 'user', 'user_username', 'certificate_type', 'description', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'workspace', 'user_username', 'created_at', 'updated_at']


class MaintenanceTicketSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = MaintenanceTicket
        fields = ['id', 'workspace', 'user', 'user_username', 'category', 'description', 'location', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'workspace', 'user_username', 'created_at', 'updated_at']


class LaboratoryBookingSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = LaboratoryBooking
        fields = ['id', 'workspace', 'user', 'user_username', 'lab_name', 'date', 'start_time', 'end_time', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'workspace', 'user_username', 'created_at', 'updated_at']


class GrievanceEscalationSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = GrievanceEscalation
        fields = ['id', 'workspace', 'user', 'user_username', 'subject', 'description', 'department', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'workspace', 'user_username', 'created_at', 'updated_at']


class InstitutionalPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = InstitutionalPolicy
        fields = ['id', 'workspace', 'name', 'description', 'rules', 'effect', 'priority', 'created_at', 'updated_at']
        read_only_fields = ['id', 'workspace', 'created_at', 'updated_at']


class RequestEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)

    class Meta:
        model = RequestEvent
        fields = [
            'id', 'request', 'actor', 'actor_username', 'actor_role',
            'event_type', 'from_status', 'to_status', 'message',
            'is_internal', 'metadata', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'actor_username']


class WorkspaceRequestSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(source='requester.username', read_only=True)
    reviewer_username = serializers.CharField(source='reviewer.username', read_only=True)
    escalated_by_username = serializers.CharField(source='escalated_by.username', read_only=True)
    timeline_events = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceRequest
        fields = [
            'id', 'display_id', 'workspace', 'requester', 'requester_username',
            'request_type', 'title', 'description', 'payload',
            'decision_status', 'execution_status',
            'reviewer', 'reviewer_username', 'reviewed_at', 'decision_reason',
            'escalated_by', 'escalated_by_username', 'escalated_at', 'escalation_reason',
            'execution_result', 'execution_evidence', 'is_archived',
            'timeline_events', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'display_id', 'workspace', 'requester', 'requester_username',
            'decision_status', 'execution_status', 'reviewer', 'reviewer_username',
            'reviewed_at', 'escalated_by', 'escalated_by_username', 'escalated_at',
            'execution_result', 'execution_evidence', 'is_archived',
            'timeline_events', 'created_at', 'updated_at'
        ]

    def get_timeline_events(self, obj):
        request = self.context.get('request')
        events = obj.timeline_events.all().order_by('created_at')
        if request and request.user:
            # If user is not admin/owner, hide internal events
            is_admin_or_owner = (
                obj.workspace.owner == request.user or
                obj.workspace.memberships.filter(user=request.user, role='ADMIN').exists()
            )
            if not is_admin_or_owner:
                events = events.filter(is_internal=False)
        return RequestEventSerializer(events, many=True).data


class WorkspaceNotificationSerializer(serializers.ModelSerializer):
    recipient_username = serializers.CharField(source='recipient.username', read_only=True)
    request_display_id = serializers.CharField(source='request.display_id', read_only=True)

    class Meta:
        model = WorkspaceNotification
        fields = [
            'id', 'workspace', 'recipient', 'recipient_username',
            'request', 'request_display_id', 'notification_type',
            'title', 'message', 'is_read', 'action_url', 'metadata',
            'created_at'
        ]
        read_only_fields = [
            'id', 'workspace', 'recipient', 'recipient_username',
            'request_display_id', 'created_at'
        ]


