from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TenantScopedModel
from apps.properties.models import Property, Unit


class ExpenseCategory(TenantScopedModel):
    """Organization-scoped expense classification (e.g. Repairs, Water, Security)."""

    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "expense categories"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="uniq_expense_category_per_org",
            )
        ]

    def __str__(self) -> str:
        return self.name


class ExpenseStatus(models.TextChoices):
    RECORDED = "RECORDED", "Recorded"
    APPROVED = "APPROVED", "Approved"
    VOID = "VOID", "Void"


class Expense(TenantScopedModel):
    """Property or unit operating expense record."""

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="expenses",
    )
    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="expenses",
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="expenses",
    )
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")
    expense_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=ExpenseStatus.choices,
        default=ExpenseStatus.RECORDED,
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_expenses",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_expenses",
    )

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(
                fields=["organization", "status", "expense_date"],
                name="idx_expense_org_status_date",
            ),
        ]

    def clean(self):
        if self.property_id and self.property.organization_id != self.organization_id:
            raise ValidationError("Property must belong to the same organization.")
        if self.category_id and self.category.organization_id != self.organization_id:
            raise ValidationError("Category must belong to the same organization.")
        if self.unit_id:
            if self.unit.organization_id != self.organization_id:
                raise ValidationError("Unit must belong to the same organization.")
            if self.unit.property_id != self.property_id:
                raise ValidationError("Unit must belong to the selected property.")
        if self.amount is not None and self.amount <= Decimal("0.00"):
            raise ValidationError("Expense amount must be positive.")
