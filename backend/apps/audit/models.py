from django.conf import settings
from django.db import models

from apps.core.models import TenantScopedModel


class AuditEvent(TenantScopedModel):
    """Append-oriented audit log for sensitive organization and financial actions."""

    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField()
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [
            models.Index(fields=["organization", "-occurred_at"]),
            models.Index(fields=["organization", "entity_type", "entity_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} ({self.entity_type}:{self.entity_id})"


def record_audit_event(
    *,
    organization,
    actor_user,
    action: str,
    entity_type: str,
    entity_id,
    metadata: dict | None = None,
) -> AuditEvent:
    """Create a tenant-scoped audit event without storing secrets."""
    is_auth_user = bool(actor_user and getattr(actor_user, "is_authenticated", False))
    return AuditEvent.objects.create(
        organization=organization,
        actor_user=actor_user if is_auth_user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {},
    )
