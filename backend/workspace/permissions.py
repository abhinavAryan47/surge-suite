from rest_framework import permissions, exceptions, status

class Explicit401Exception(exceptions.APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = 'Authentication credentials were not provided.'
    default_code = 'not_authenticated'

class IsAuthenticatedOr401(permissions.BasePermission):
    """
    Enforces HTTP 401 Unauthorized for unauthenticated requests.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            raise Explicit401Exception()
        return True

class IsWorkspaceOwner(permissions.BasePermission):
    """
    Permission checking that request.user is the owner of the workspace.
    """
    def has_object_permission(self, request, view, obj):
        # obj is a Workspace instance
        if not request.user.is_authenticated:
            return False
        return obj.owner == request.user

class IsWorkspaceMember(permissions.BasePermission):
    """
    Permission checking that request.user is the owner or a member of the workspace.
    """
    def has_object_permission(self, request, view, obj):
        # obj is a Workspace instance
        if not request.user.is_authenticated:
            return False
        return obj.owner == request.user or obj.memberships.filter(user=request.user).exists()

class IsWorkspaceAdminOrOwner(permissions.BasePermission):
    """
    Permission checking that request.user is an ADMIN or OWNER of the workspace.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if obj.owner == request.user:
            return True
        return obj.memberships.filter(user=request.user, role='ADMIN').exists()

class IsWorkspaceWriter(permissions.BasePermission):
    """
    Permission checking that request.user is an OWNER, ADMIN, or MEMBER (not VIEWER).
    """
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if obj.owner == request.user:
            return True
        return obj.memberships.filter(user=request.user, role__in=['ADMIN', 'MEMBER']).exists()

