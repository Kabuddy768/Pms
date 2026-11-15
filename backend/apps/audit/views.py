from rest_framework import generics

from apps.core.tenancy import TenantScopedMixin, require_org_roles
from apps.organizations.models import OrganizationRole

from .models import AuditEvent
from .serializers import AuditEventSerializer


class AuditEventListView(TenantScopedMixin, generics.ListAPIView):
    """Read-only tenant-scoped audit log for OWNER and MANAGER roles."""

    permission_classes = [require_org_roles(OrganizationRole.OWNER, OrganizationRole.MANAGER)]
    serializer_class = AuditEventSerializer
    queryset = AuditEvent.objects.select_related("actor_user").all()
    filterset_fields = ["action", "entity_type"]
    search_fields = ["action", "entity_type", "actor_user__email"]
