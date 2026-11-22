from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.organizations.models import OrganizationRole

from .models import Attachment, AttachmentEntityType
from .serializers import AttachmentSerializer

CARETAKER_ALLOWED_ENTITY_TYPES = (
    AttachmentEntityType.MAINTENANCE,
    AttachmentEntityType.INSPECTION,
)
ADMIN_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)


class AttachmentViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """URL-only external media/document attachment links scoped by organization."""

    serializer_class = AttachmentSerializer
    queryset = Attachment.objects.select_related("uploaded_by").all()
    filterset_fields = ["entity_type", "entity_id"]
    search_fields = ["title", "file_url"]
    ordering_fields = ["created_at", "title"]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method == "DELETE":
            return [require_org_roles(*ADMIN_WRITE_ROLES)()]
        return [HasOrganizationMembership()]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx

    def perform_create(self, serializer):
        membership = self.request.membership
        entity_type = serializer.validated_data["entity_type"]
        if (
            membership.role == OrganizationRole.CARETAKER
            and entity_type not in CARETAKER_ALLOWED_ENTITY_TYPES
        ):
            raise PermissionDenied(
                "Caretakers can only attach maintenance or inspection photos."
            )

        att = serializer.save(
            organization=self.get_organization(),
            uploaded_by=self.request.user,
        )
        record_audit_event(
            organization=att.organization,
            actor_user=self.request.user,
            action="ATTACHMENT_ADDED",
            entity_type=att.entity_type,
            entity_id=att.entity_id,
            metadata={"title": att.title, "file_url": att.file_url},
        )

    def perform_destroy(self, instance):
        record_audit_event(
            organization=instance.organization,
            actor_user=self.request.user,
            action="ATTACHMENT_REMOVED",
            entity_type=instance.entity_type,
            entity_id=instance.entity_id,
            metadata={"title": instance.title, "attachment_id": str(instance.id)},
        )
        instance.delete()
