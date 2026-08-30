from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TaskViewSet, AgentViewSet, ProviderSettingsView, ProviderSettingsDetailView,
    BuiltinMCPServerListView, UserMCPServerViewSet,
    CertificateRequestViewSet, MaintenanceTicketViewSet, LaboratoryBookingViewSet, GrievanceEscalationViewSet,
    InstitutionalPolicyViewSet,
    WorkspaceRequestViewSet, ReviewCenterViewSet, WorkspaceNotificationViewSet
)

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'agents', AgentViewSet, basename='agent')
router.register(r'requests', WorkspaceRequestViewSet, basename='workspace-requests')
router.register(r'review-center', ReviewCenterViewSet, basename='review-center')
router.register(r'notifications', WorkspaceNotificationViewSet, basename='workspace-notifications')
router.register(r'mcp/custom', UserMCPServerViewSet, basename='mcp-custom')
router.register(r'mcp/policies', InstitutionalPolicyViewSet, basename='mcp-policies')
router.register(r'workflows/certificates', CertificateRequestViewSet, basename='workflow-certificates')
router.register(r'workflows/maintenance', MaintenanceTicketViewSet, basename='workflow-maintenance')
router.register(r'workflows/laboratory', LaboratoryBookingViewSet, basename='workflow-laboratory')
router.register(r'workflows/grievances', GrievanceEscalationViewSet, basename='workflow-grievances')

urlpatterns = [
    path('', include(router.urls)),
    path('mcp/builtin/', BuiltinMCPServerListView.as_view(), name='mcp-builtin'),
    path('settings/providers/', ProviderSettingsView.as_view(), name='provider-settings'),
    path('settings/providers/<str:provider>/', ProviderSettingsDetailView.as_view(), name='provider-settings-detail'),
]
