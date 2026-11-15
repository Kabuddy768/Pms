from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TenantScopedModel
from apps.leasing.models import Tenant
from apps.properties.models import Property, Unit


class MaintenancePriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


class MaintenanceStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    RESOLVED = "RESOLVED", "Resolved"
    CLOSED = "CLOSED", "Closed"


class MaintenanceRequest(TenantScopedModel):
    """Property/unit maintenance ticket with assignment and status tracking."""

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="maintenance_requests",
    )
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="maintenance_requests",
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="maintenance_requests",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority = models.CharField(
        max_length=20,
        choices=MaintenancePriority.choices,
        default=MaintenancePriority.MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=MaintenanceStatus.choices,
        default=MaintenanceStatus.OPEN,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_maintenance_requests",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_maintenance_requests",
    )

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if self.property_id and self.property.organization_id != self.organization_id:
            raise ValidationError("Property must belong to the same organization.")
        if self.unit_id:
            if self.unit.organization_id != self.organization_id:
                raise ValidationError("Unit must belong to the same organization.")
            if self.unit.property_id != self.property_id:
                raise ValidationError("Unit must belong to the selected property.")
        if self.tenant_id and self.tenant.organization_id != self.organization_id:
            raise ValidationError("Tenant must belong to the same organization.")
