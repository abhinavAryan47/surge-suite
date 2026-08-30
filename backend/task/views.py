from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from rest_framework.views import APIView
from workspace.models import Workspace
from workspace.permissions import IsAuthenticatedOr401
from .models import (
    Task, Agent, TaskExecution, UserMCPServer,
    CertificateRequest, MaintenanceTicket, LaboratoryBooking, GrievanceEscalation, InstitutionalPolicy,
    WorkspaceRequest, RequestEvent, WorkspaceNotification
)
from .serializers import (
    TaskSerializer, AgentSerializer, TaskExecutionSerializer, UserMCPServerSerializer,
    CertificateRequestSerializer, MaintenanceTicketSerializer, LaboratoryBookingSerializer, GrievanceEscalationSerializer,
    InstitutionalPolicySerializer,
    WorkspaceRequestSerializer, RequestEventSerializer, WorkspaceNotificationSerializer
)
from .permissions import IsWorkspaceMemberForTask
from .services.task_service import TaskService
from .services.execution_service import ExecutionService

class AgentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing active agents.
    """
    queryset = Agent.objects.filter(status='ACTIVE')
    serializer_class = AgentSerializer
    permission_classes = [permissions.IsAuthenticated]

class TaskViewSet(viewsets.ModelViewSet):
    """
    API endpoints for listing, creating, and executing workspace tasks.
    """
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [IsWorkspaceMemberForTask]

    def get_queryset(self):
        user = self.request.user
        workspace_id = self.request.query_params.get('workspace')
        
        # Enforce that query workspace is provided
        if not workspace_id:
            return Task.objects.none()

        workspace = get_object_or_404(Workspace, id=workspace_id)
        
        # Check permissions: user must be owner or member
        if workspace.owner != user and not workspace.memberships.filter(user=user).exists():
            return Task.objects.none()

        return Task.objects.filter(workspace=workspace).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        # We override create to invoke the TaskService
        workspace_id = request.data.get('workspace')
        problem_statement = request.data.get('problem_statement')

        if not workspace_id or not problem_statement:
            return Response(
                {"error": "Both workspace and problem_statement fields are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        workspace = get_object_or_404(Workspace, id=workspace_id)
        
        # Enforce workspace access check
        self.check_object_permissions(request, workspace)

        # Reject VIEWER role from creating tasks
        is_viewer = workspace.owner != request.user and workspace.memberships.filter(user=request.user, role='VIEWER').exists()
        if is_viewer:
            return Response(
                {"error": "Permission Denied: Read-only VIEWER role cannot create tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        task_service = TaskService()
        task = task_service.create_task(
            workspace=workspace,
            creator=request.user,
            problem_statement=problem_statement
        )

        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        task = get_object_or_404(Task, id=kwargs.get('pk'))
        self.check_object_permissions(request, task)
        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        return Response(
            {"error": "Direct updates to tasks are not allowed."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"error": "Task deletion is not allowed."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @action(detail=True, methods=['post'], permission_classes=[IsWorkspaceMemberForTask])
    def execute(self, request, pk=None):
        task = get_object_or_404(Task, id=pk)
        self.check_object_permissions(request, task)

        # Reject VIEWER role from executing tasks
        is_viewer = task.workspace.owner != request.user and task.workspace.memberships.filter(user=request.user, role='VIEWER').exists()
        if is_viewer:
            return Response(
                {"error": "Permission Denied: Read-only VIEWER role cannot execute tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        if task.status == 'RUNNING':
            return Response(
                {"error": "Task is already executing."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Execute synchronously using service layer
        execution_service = ExecutionService()
        execution = execution_service.execute_task(task, user=request.user)

        # Refresh task from DB to pick up latest state
        task.refresh_from_db()
        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[IsWorkspaceMemberForTask])
    def walkthrough(self, request, pk=None):
        import os
        from django.conf import settings
        from django.http import HttpResponse
        task = get_object_or_404(Task, id=pk)
        self.check_object_permissions(request, task)

        artifact_path = os.path.join(os.path.dirname(settings.BASE_DIR), '.surge', 'task-artifacts', str(task.id), 'walkthrough.md')
        if not os.path.exists(artifact_path):
            return Response(
                {"error": "Walkthrough artifact has not been generated for this task."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            with open(artifact_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if request.query_params.get('download') == 'true':
                response = HttpResponse(content, content_type='text/markdown')
                response['Content-Disposition'] = f'attachment; filename="walkthrough-{str(task.id)[:8]}.md"'
                return response

            return Response({
                "task_id": str(task.id),
                "filename": "walkthrough.md",
                "content": content
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": f"Failed to read walkthrough artifact: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsWorkspaceMemberForTask],
        url_path=r'approvals/(?P<approval_id>[0-9a-f-]+)/approve'
    )
    def approve_command(self, request, pk=None, approval_id=None):
        """
        Phase 4.7: Approve a pending shell command authorization request.

        POST /tasks/{task_id}/approvals/{approval_id}/approve/

        The command is re-classified immediately before execution.
        BLOCKED commands cannot be approved even via this endpoint.
        """
        from .services.approval_service import ApprovalService, ApprovalValidationError

        task = get_object_or_404(Task, id=pk)
        self.check_object_permissions(request, task)

        # Only task creator, workspace ADMIN, or OWNER can approve commands
        is_authorized = (
            request.user == task.creator
            or task.workspace.owner == request.user
            or task.workspace.memberships.filter(user=request.user, role='ADMIN').exists()
        )
        if not is_authorized:
            return Response(
                {"error": "Permission Denied: Only the task creator, workspace ADMIN, or OWNER can authorize execution requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        if task.status != 'WAITING_FOR_APPROVAL':
            return Response(
                {"error": f"Task is not waiting for approval (current status: {task.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not approval_id:
            return Response(
                {"error": "approval_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            approval_service = ApprovalService()
            approval_service.resolve_approve(
                approval_id=approval_id,
                task_id=str(pk),
                resolving_user=request.user
            )
        except ApprovalValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Approval processing failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        task.refresh_from_db()
        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsWorkspaceMemberForTask],
        url_path=r'approvals/(?P<approval_id>[0-9a-f-]+)/deny'
    )
    def deny_command(self, request, pk=None, approval_id=None):
        """
        Phase 4.7: Deny a pending shell command authorization request.

        POST /tasks/{task_id}/approvals/{approval_id}/deny/

        The command is NEVER executed after denial.
        The agent receives explicit denial feedback and adapts its response.
        """
        from .services.approval_service import ApprovalService, ApprovalValidationError

        task = get_object_or_404(Task, id=pk)
        self.check_object_permissions(request, task)

        # Only task creator, workspace ADMIN, or OWNER can deny commands
        is_authorized = (
            request.user == task.creator
            or task.workspace.owner == request.user
            or task.workspace.memberships.filter(user=request.user, role='ADMIN').exists()
        )
        if not is_authorized:
            return Response(
                {"error": "Permission Denied: Only the task creator, workspace ADMIN, or OWNER can authorize execution requests."},
                status=status.HTTP_403_FORBIDDEN
            )

        if task.status != 'WAITING_FOR_APPROVAL':
            return Response(
                {"error": f"Task is not waiting for approval (current status: {task.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not approval_id:
            return Response(
                {"error": "approval_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            approval_service = ApprovalService()
            approval_service.resolve_deny(
                approval_id=approval_id,
                task_id=str(pk),
                resolving_user=request.user
            )
        except ApprovalValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Denial processing failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        task.refresh_from_db()
        serializer = self.get_serializer(task)
        return Response(serializer.data, status=status.HTTP_200_OK)

from rest_framework.views import APIView
from django.db import transaction
from .models import UserProviderCredential
from .utils.encryption import encrypt_value, decrypt_value

SUPPORTED_PROVIDERS = {
    "openclaw": "OpenClaw",
    "opencode": "OpenCode",
    "groq": "Groq",
    "nvidia_nim": "NVIDIA NIM",
    "gemini": "Google AI Studio",
}

class ProviderSettingsView(APIView):
    permission_classes = [IsAuthenticatedOr401]

    def get(self, request):
        user = request.user
        credentials = {
            c.provider: decrypt_value(c.encrypted_api_key)
            for c in UserProviderCredential.objects.filter(user=user)
        }
        
        response_data = []
        for p_id, p_name in SUPPORTED_PROVIDERS.items():
            key = credentials.get(p_id)
            configured = bool(key)
            masked = "••••••••" + key[-4:] if (key and len(key) >= 4) else ("••••" if key else None)
            response_data.append({
                "provider": p_id,
                "configured": configured,
                "masked_key": masked
            })
        return Response(response_data, status=status.HTTP_200_OK)

class ProviderSettingsDetailView(APIView):
    permission_classes = [IsAuthenticatedOr401]

    def post(self, request, provider):
        return self._save_key(request, provider)

    def put(self, request, provider):
        return self._save_key(request, provider)

    def _save_key(self, request, provider):
        provider = provider.lower()
        if provider not in SUPPORTED_PROVIDERS:
            return Response(
                {"error": f"Unsupported provider: '{provider}'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        api_key = request.data.get("api_key")
        if not api_key:
            return Response(
                {"error": "api_key field is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        encrypted = encrypt_value(api_key)
        
        # Save or update credential atomically
        with transaction.atomic():
            cred, created = UserProviderCredential.objects.get_or_create(
                user=user,
                provider=provider,
                defaults={"encrypted_api_key": encrypted}
            )
            if not created:
                cred.encrypted_api_key = encrypted
                cred.save()
                
        # Return masked key
        masked = "••••••••" + api_key[-4:] if len(api_key) >= 4 else "••••"
        return Response({
            "provider": provider,
            "configured": True,
            "masked_key": masked
        }, status=status.HTTP_200_OK)

    def delete(self, request, provider):
        provider = provider.lower()
        if provider not in SUPPORTED_PROVIDERS:
            return Response(
                {"error": f"Unsupported provider: '{provider}'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        deleted_count, _ = UserProviderCredential.objects.filter(user=user, provider=provider).delete()
        
        return Response({
            "provider": provider,
            "configured": False,
            "masked_key": None
        }, status=status.HTTP_200_OK)


class BuiltinMCPServerListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .services.mcp.config import MCP_SERVER_CONFIGS
        data = []
        for cfg in MCP_SERVER_CONFIGS:
            data.append({
                "name": cfg["name"],
                "description": f"Built-in {cfg['name']} MCP server.",
                "configuration": {
                    "command": cfg["command"],
                    "env": {}
                },
                "tools": cfg.get("tools", [])
            })
        return Response(data, status=status.HTTP_200_OK)


class UserMCPServerViewSet(viewsets.ModelViewSet):
    serializer_class = UserMCPServerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserMCPServer.objects.filter(user=self.request.user).order_by('name')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CertificateRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CertificateRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                from django.core.exceptions import ValidationError
                try:
                    obj = CertificateRequest.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (CertificateRequest.DoesNotExist, ValueError, ValidationError):
                    return CertificateRequest.objects.none()
            else:
                return CertificateRequest.objects.none()
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            return CertificateRequest.objects.none()
        
        is_admin_or_owner = workspace.owner == self.request.user or workspace.memberships.filter(user=self.request.user, role='ADMIN').exists()
        if is_admin_or_owner:
            return CertificateRequest.objects.filter(workspace_id=workspace_id).order_by('-created_at')
        return CertificateRequest.objects.filter(workspace_id=workspace_id, user=self.request.user).order_by('-created_at')


class MaintenanceTicketViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MaintenanceTicketSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                from django.core.exceptions import ValidationError
                try:
                    obj = MaintenanceTicket.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (MaintenanceTicket.DoesNotExist, ValueError, ValidationError):
                    return MaintenanceTicket.objects.none()
            else:
                return MaintenanceTicket.objects.none()
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            return MaintenanceTicket.objects.none()
        
        is_admin_or_owner = workspace.owner == self.request.user or workspace.memberships.filter(user=self.request.user, role='ADMIN').exists()
        if is_admin_or_owner:
            return MaintenanceTicket.objects.filter(workspace_id=workspace_id).order_by('-created_at')
        return MaintenanceTicket.objects.filter(workspace_id=workspace_id, user=self.request.user).order_by('-created_at')


class LaboratoryBookingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LaboratoryBookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                from django.core.exceptions import ValidationError
                try:
                    obj = LaboratoryBooking.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (LaboratoryBooking.DoesNotExist, ValueError, ValidationError):
                    return LaboratoryBooking.objects.none()
            else:
                return LaboratoryBooking.objects.none()
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            return LaboratoryBooking.objects.none()
        
        is_admin_or_owner = workspace.owner == self.request.user or workspace.memberships.filter(user=self.request.user, role='ADMIN').exists()
        if is_admin_or_owner:
            return LaboratoryBooking.objects.filter(workspace_id=workspace_id).order_by('-created_at')
        return LaboratoryBooking.objects.filter(workspace_id=workspace_id, user=self.request.user).order_by('-created_at')


class GrievanceEscalationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = GrievanceEscalationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                from django.core.exceptions import ValidationError
                try:
                    obj = GrievanceEscalation.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (GrievanceEscalation.DoesNotExist, ValueError, ValidationError):
                    return GrievanceEscalation.objects.none()
            else:
                return GrievanceEscalation.objects.none()
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            return GrievanceEscalation.objects.none()
        
        is_admin_or_owner = workspace.owner == self.request.user or workspace.memberships.filter(user=self.request.user, role='ADMIN').exists()
        if is_admin_or_owner:
            return GrievanceEscalation.objects.filter(workspace_id=workspace_id).order_by('-created_at')
        return GrievanceEscalation.objects.filter(workspace_id=workspace_id, user=self.request.user).order_by('-created_at')


class InstitutionalPolicyViewSet(viewsets.ModelViewSet):
    serializer_class = InstitutionalPolicySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                from django.core.exceptions import ValidationError
                try:
                    obj = InstitutionalPolicy.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (InstitutionalPolicy.DoesNotExist, ValueError, ValidationError):
                    return InstitutionalPolicy.objects.none()
            else:
                return InstitutionalPolicy.objects.none()
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            return InstitutionalPolicy.objects.none()
        return InstitutionalPolicy.objects.filter(workspace_id=workspace_id).order_by('-priority')

    def perform_create(self, serializer):
        workspace_id = self.request.data.get('workspace')
        from workspace.models import Workspace
        from rest_framework.exceptions import ValidationError, PermissionDenied
        try:
            workspace = Workspace.objects.get(id=workspace_id)
        except (Workspace.DoesNotExist, ValueError):
            raise ValidationError("Workspace not found.")

        if workspace.owner != self.request.user and not workspace.memberships.filter(user=self.request.user).exists():
            raise ValidationError("You are not a member of this workspace.")

        is_admin_or_owner = workspace.owner == self.request.user or workspace.memberships.filter(user=self.request.user, role='ADMIN').exists()
        if not is_admin_or_owner:
            raise PermissionDenied("Permission Denied: Only workspace ADMIN or OWNER can create institutional policies.")
        serializer.save(workspace_id=workspace_id)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        workspace = instance.workspace
        is_admin_or_owner = workspace.owner == request.user or workspace.memberships.filter(user=request.user, role='ADMIN').exists()
        if not is_admin_or_owner:
            return Response(
                {"error": "Permission Denied: Only workspace ADMIN or OWNER can modify institutional policies."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        workspace = instance.workspace
        is_admin_or_owner = workspace.owner == request.user or workspace.memberships.filter(user=request.user, role='ADMIN').exists()
        if not is_admin_or_owner:
            return Response(
                {"error": "Permission Denied: Only workspace ADMIN or OWNER can delete institutional policies."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class WorkspaceRequestViewSet(viewsets.ModelViewSet):
    """
    API endpoint for viewing and submitting human-in-the-loop workspace requests.
    Supports member filtering, status tabs [ongoing, approved, rejected], and search.
    """
    serializer_class = WorkspaceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                try:
                    obj = WorkspaceRequest.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (WorkspaceRequest.DoesNotExist, ValueError):
                    return WorkspaceRequest.objects.none()
            else:
                return WorkspaceRequest.objects.none()

        workspace = get_object_or_404(Workspace, id=workspace_id)
        user = self.request.user

        # Access check
        if workspace.owner != user and not workspace.memberships.filter(user=user).exists():
            return WorkspaceRequest.objects.none()

        is_admin_or_owner = workspace.owner == user or workspace.memberships.filter(user=user, role='ADMIN').exists()
        mine_only = self.request.query_params.get('mine') == 'true'

        if is_admin_or_owner and not mine_only:
            qs = WorkspaceRequest.objects.filter(workspace=workspace, is_archived=False)
        else:
            qs = WorkspaceRequest.objects.filter(workspace=workspace, requester=user, is_archived=False)

        # Tab filtering
        status_tab = self.request.query_params.get('status_tab')
        if status_tab == 'ongoing':
            qs = qs.filter(decision_status__in=['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'])
        elif status_tab == 'approved':
            qs = qs.filter(decision_status='APPROVED')
        elif status_tab == 'rejected':
            qs = qs.filter(decision_status='REJECTED')

        # Type filtering
        request_type = self.request.query_params.get('request_type')
        if request_type:
            qs = qs.filter(request_type=request_type)

        # Search filtering
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(display_id__icontains=search) |
                Q(title__icontains=search) |
                Q(description__icontains=search)
            )

        return qs.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied, ValidationError

        workspace_id = request.data.get('workspace_id') or request.data.get('workspace')
        request_type = request.data.get('request_type', 'GENERAL')
        title = request.data.get('title')
        description = request.data.get('description', '')
        payload = request.data.get('payload', {})

        if not workspace_id or not title:
            return Response(
                {"error": "Both workspace_id and title are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        workspace = get_object_or_404(Workspace, id=workspace_id)

        try:
            req_obj = RequestService.create_request(
                workspace=workspace,
                requester=request.user,
                request_type=request_type,
                title=title,
                description=description,
                payload=payload
            )
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Failed to create request: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = self.get_serializer(req_obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied

        req_obj = get_object_or_404(WorkspaceRequest, id=pk)
        try:
            archived_req = RequestService.archive_request(req_obj, request.user)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(archived_req)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReviewCenterViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for Workspace Admins & Owners to review, escalate, approve, and reject requests.
    Members and Viewers receive HTTP 403 Forbidden.
    """
    serializer_class = WorkspaceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            pk = self.kwargs.get('pk')
            if pk:
                try:
                    obj = WorkspaceRequest.objects.get(pk=pk)
                    workspace_id = obj.workspace_id
                except (WorkspaceRequest.DoesNotExist, ValueError):
                    return WorkspaceRequest.objects.none()
            else:
                return WorkspaceRequest.objects.none()

        workspace = get_object_or_404(Workspace, id=workspace_id)
        user = self.request.user

        is_admin_or_owner = workspace.owner == user or workspace.memberships.filter(user=user, role='ADMIN').exists()
        if not is_admin_or_owner:
            return WorkspaceRequest.objects.none()

        qs = WorkspaceRequest.objects.filter(workspace=workspace, is_archived=False)

        queue = self.request.query_params.get('queue', 'pending')
        if queue == 'pending':
            qs = qs.filter(decision_status__in=['SUBMITTED', 'UNDER_REVIEW'])
        elif queue == 'escalated':
            qs = qs.filter(decision_status='ESCALATED')
        elif queue == 'history':
            qs = qs.filter(decision_status__in=['APPROVED', 'REJECTED'])

        request_type = self.request.query_params.get('request_type')
        if request_type:
            qs = qs.filter(request_type=request_type)

        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(display_id__icontains=search) |
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(requester__username__icontains=search)
            )

        return qs.order_by('-created_at')

    def list(self, request, *args, **kwargs):
        workspace_id = request.query_params.get('workspace_id')
        if not workspace_id:
            return Response({"error": "workspace_id query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        workspace = get_object_or_404(Workspace, id=workspace_id)
        is_admin_or_owner = workspace.owner == request.user or workspace.memberships.filter(user=request.user, role='ADMIN').exists()
        if not is_admin_or_owner:
            return Response({"error": "Permission Denied: Review Center is restricted to workspace ADMIN and OWNER."}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='start-review')
    def start_review(self, request, pk=None):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied

        req_obj = get_object_or_404(WorkspaceRequest, id=pk)
        try:
            reviewed_req = RequestService.start_review(req_obj, request.user)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(reviewed_req)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='escalate')
    def escalate(self, request, pk=None):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied, ValidationError

        req_obj = get_object_or_404(WorkspaceRequest, id=pk)
        reason = request.data.get('reason')

        if not reason or not reason.strip():
            return Response({"error": "An escalation reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            escalated_req = RequestService.escalate_request(req_obj, request.user, reason)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = self.get_serializer(escalated_req)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied, ValidationError

        req_obj = get_object_or_404(WorkspaceRequest, id=pk)
        reason = request.data.get('reason', '')

        try:
            approved_req = RequestService.approve_request(req_obj, request.user, reason)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = self.get_serializer(approved_req)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        from .services.request_service import RequestService
        from django.core.exceptions import PermissionDenied, ValidationError

        req_obj = get_object_or_404(WorkspaceRequest, id=pk)
        reason = request.data.get('reason')

        if not reason or not reason.strip():
            return Response({"error": "A rejection reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rejected_req = RequestService.reject_request(req_obj, request.user, reason)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = self.get_serializer(rejected_req)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for querying and managing user notifications within an active workspace.
    """
    serializer_class = WorkspaceNotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        workspace_id = self.request.query_params.get('workspace_id')
        if not workspace_id:
            return WorkspaceNotification.objects.none()

        workspace = get_object_or_404(Workspace, id=workspace_id)
        user = self.request.user

        if workspace.owner != user and not workspace.memberships.filter(user=user).exists():
            return WorkspaceNotification.objects.none()

        qs = WorkspaceNotification.objects.filter(workspace=workspace, recipient=user)
        if self.request.query_params.get('unread_only') == 'true':
            qs = qs.filter(is_read=False)
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        from .services.notification_service import NotificationService

        workspace_id = request.query_params.get('workspace_id')
        if not workspace_id:
            return Response({"error": "workspace_id query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != request.user and not workspace.memberships.filter(user=request.user).exists():
            return Response({"error": "You do not have access to this workspace."}, status=status.HTTP_403_FORBIDDEN)

        count = NotificationService.get_unread_count(workspace, request.user)
        return Response({"unread_count": count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        from .services.notification_service import NotificationService

        notif = get_object_or_404(WorkspaceNotification, id=pk, recipient=request.user)
        NotificationService.mark_as_read(str(notif.id), request.user)
        return Response({"success": True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        from .services.notification_service import NotificationService

        workspace_id = request.data.get('workspace_id') or request.query_params.get('workspace_id')
        if not workspace_id:
            return Response({"error": "workspace_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        workspace = get_object_or_404(Workspace, id=workspace_id)
        if workspace.owner != request.user and not workspace.memberships.filter(user=request.user).exists():
            return Response({"error": "You do not have access to this workspace."}, status=status.HTTP_403_FORBIDDEN)

        cleared_count = NotificationService.mark_all_as_read(workspace, request.user)
        return Response({"success": True, "cleared_count": cleared_count}, status=status.HTTP_200_OK)



