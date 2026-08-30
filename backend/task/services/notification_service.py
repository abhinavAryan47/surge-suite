from django.utils import timezone
from django.db import transaction
from django.contrib.auth.models import User
from workspace.models import Workspace
from task.models import WorkspaceNotification, WorkspaceRequest


class NotificationService:
    """
    Workspace-scoped notification service supporting isolated event dispatch
    for members, admins, and workspace owners.
    """

    @staticmethod
    def notify_user(
        workspace: Workspace,
        recipient: User,
        notification_type: str,
        title: str,
        message: str,
        request: WorkspaceRequest = None,
        action_url: str = "",
        metadata: dict = None
    ) -> WorkspaceNotification:
        """
        Creates and stores a workspace-scoped notification for a single recipient.
        """
        # Security: verify recipient is a member or owner of the workspace
        if workspace.owner != recipient and not workspace.memberships.filter(user=recipient).exists():
            return None

        return WorkspaceNotification.objects.create(
            workspace=workspace,
            recipient=recipient,
            request=request,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
            metadata=metadata or {}
        )

    @staticmethod
    def notify_workspace_admins_and_owner(
        workspace: Workspace,
        notification_type: str,
        title: str,
        message: str,
        request: WorkspaceRequest = None,
        action_url: str = "",
        exclude_user: User = None,
        metadata: dict = None
    ) -> list[WorkspaceNotification]:
        """
        Broadcasts a notification to the workspace owner and all workspace admins.
        """
        recipients = set()
        if workspace.owner:
            recipients.add(workspace.owner)

        admin_users = User.objects.filter(
            workspace_memberships__workspace=workspace,
            workspace_memberships__role='ADMIN'
        )
        for admin in admin_users:
            recipients.add(admin)

        if exclude_user:
            recipients.discard(exclude_user)

        notifications = []
        with transaction.atomic():
            for user in recipients:
                notif = WorkspaceNotification.objects.create(
                    workspace=workspace,
                    recipient=user,
                    request=request,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    action_url=action_url,
                    metadata=metadata or {}
                )
                notifications.append(notif)

        return notifications

    @staticmethod
    def notify_workspace_owner(
        workspace: Workspace,
        notification_type: str,
        title: str,
        message: str,
        request: WorkspaceRequest = None,
        action_url: str = "",
        metadata: dict = None
    ) -> WorkspaceNotification:
        """
        Sends an urgent or escalation notification specifically to the workspace owner.
        """
        if not workspace.owner:
            return None

        return WorkspaceNotification.objects.create(
            workspace=workspace,
            recipient=workspace.owner,
            request=request,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
            metadata=metadata or {}
        )

    @staticmethod
    def get_unread_count(workspace: Workspace, user: User) -> int:
        """
        Returns count of unread notifications for a user in a specific workspace.
        """
        return WorkspaceNotification.objects.filter(
            workspace=workspace,
            recipient=user,
            is_read=False
        ).count()

    @staticmethod
    def mark_as_read(notification_id: str, user: User) -> bool:
        """
        Marks a specific notification as read after validating user ownership.
        """
        updated = WorkspaceNotification.objects.filter(
            id=notification_id,
            recipient=user
        ).update(is_read=True)
        return updated > 0

    @staticmethod
    def mark_all_as_read(workspace: Workspace, user: User) -> int:
        """
        Marks all notifications as read for a user in a specific workspace.
        """
        return WorkspaceNotification.objects.filter(
            workspace=workspace,
            recipient=user,
            is_read=False
        ).update(is_read=True)
