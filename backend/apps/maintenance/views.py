from rest_framework import viewsets

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin

from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer


class MaintenanceRequestViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Maintenance workflow; all active organization roles (including CARETAKER) may update."""

    permission_classes = [HasOrganizationMembership]
    serializer_class = MaintenanceRequestSerializer
    queryset = MaintenanceRequest.objects.select_related(
        "property", "unit", "tenant", "assigned_to", "created_by"
    ).all()
    filterset_fields = ["status", "priority", "property", "unit"]
    search_fields = ["title", "description", "property__name", "unit__unit_code"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx

    def perform_create(self, serializer):
        org = self.get_organization()
        req = serializer.save(organization=org, created_by=self.request.user)
        record_audit_event(
            organization=org,
            actor_user=self.request.user,
            action="MAINTENANCE_CREATED",
            entity_type="MaintenanceRequest",
            entity_id=req.id,
            metadata={"title": req.title, "priority": req.priority},
        )

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        req = serializer.save()
        if req.status != old_status:
            record_audit_event(
                organization=req.organization,
                actor_user=self.request.user,
                action="MAINTENANCE_STATUS_CHANGED",
                entity_type="MaintenanceRequest",
                entity_id=req.id,
                metadata={"old_status": old_status, "new_status": req.status},
            )
