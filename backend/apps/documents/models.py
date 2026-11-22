from django.conf import settings
from django.db import models

from apps.core.models import TenantScopedModel


class AttachmentEntityType(models.TextChoices):
    MAINTENANCE = "MAINTENANCE", "Maintenance Request"
    LEASE = "LEASE", "Lease"
    EXPENSE = "EXPENSE", "Expense"
    INSPECTION = "INSPECTION", "Unit Inspection"


class Attachment(TenantScopedModel):
    """URL-only reference to external object storage (R2/S3/Cloudinary); never DB blobs."""

    entity_type = models.CharField(max_length=20, choices=AttachmentEntityType.choices)
    entity_id = models.UUIDField()
    title = models.CharField(max_length=255)
    file_url = models.URLField(max_length=1000)
    content_type = models.CharField(max_length=100, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_attachments",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["organization", "entity_type", "entity_id"],
                name="idx_attach_org_entity",
            )
        ]

    def __str__(self) -> str:
        return f"{self.entity_type}:{self.title}"
