from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q

from apps.core.models import TenantScopedModel
from apps.leasing.models import Lease


class SequenceType(models.TextChoices):
    INVOICE = "INVOICE", "Invoice"
    RECEIPT = "RECEIPT", "Receipt"


class OrganizationSequence(TenantScopedModel):
    """Per-organization sequential counter locked with SELECT ... FOR UPDATE."""

    sequence_type = models.CharField(max_length=20, choices=SequenceType.choices)
    year = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "sequence_type", "year"],
                name="uniq_org_sequence_per_year",
            )
        ]


@transaction.atomic
def next_sequence_number(*, organization, sequence_type: str, year: int) -> str:
    """Atomically increment and format INV-YYYY-XXXX or RCPT-YYYY-XXXX."""
    seq, _ = OrganizationSequence.objects.select_for_update().get_or_create(
        organization=organization,
        sequence_type=sequence_type,
        year=year,
        defaults={"last_number": 0},
    )
    seq.last_number += 1
    seq.save(update_fields=["last_number", "updated_at"])
    prefix = "INV" if sequence_type == SequenceType.INVOICE else "RCPT"
    return f"{prefix}-{year}-{seq.last_number:04d}"


class InvoiceStatus(models.TextChoices):
    ISSUED = "ISSUED", "Issued"
    PARTIAL = "PARTIAL", "Partial"
    PAID = "PAID", "Paid"
    VOID = "VOID", "Void"


class Invoice(TenantScopedModel):
    """Issued rent or utility invoice under a lease."""

    lease = models.ForeignKey(
        Lease,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    invoice_number = models.CharField(max_length=40)
    billing_period = models.CharField(max_length=7, blank=True, default="")
    issue_date = models.DateField()
    due_date = models.DateField()
    currency = models.CharField(max_length=3, default="KES")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=InvoiceStatus.choices,
        default=InvoiceStatus.ISSUED,
    )

    class Meta:
        ordering = ["-issue_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "invoice_number"],
                name="uniq_invoice_number_per_org",
            ),
            models.UniqueConstraint(
                fields=["organization", "lease", "billing_period"],
                condition=~Q(billing_period=""),
                name="uniq_invoice_per_lease_period",
            ),
        ]

    def clean(self):
        if self.lease_id and self.organization_id:
            if self.lease.organization_id != self.organization_id:
                raise ValidationError("Invoice lease must belong to the same organization.")

    def adjusted_total(self) -> Decimal:
        total = self.total_amount
        for adj in self.adjustments.all():
            if adj.adjustment_type == AdjustmentType.DEBIT:
                total += adj.amount
            else:
                total -= adj.amount
        return max(Decimal("0.00"), total)

    def allocated_amount(self) -> Decimal:
        return sum(
            (alloc.amount for alloc in self.allocations.filter(status="ACTIVE")),
            Decimal("0.00"),
        )

    def outstanding_balance(self) -> Decimal:
        if self.status == InvoiceStatus.VOID:
            return Decimal("0.00")
        return max(Decimal("0.00"), self.adjusted_total() - self.allocated_amount())

    def refresh_status(self):
        if self.status == InvoiceStatus.VOID:
            return
        adj_total = self.adjusted_total()
        allocated = self.allocated_amount()
        if adj_total <= Decimal("0.00") or allocated >= adj_total:
            new_status = InvoiceStatus.PAID
        elif allocated > Decimal("0.00"):
            new_status = InvoiceStatus.PARTIAL
        else:
            new_status = InvoiceStatus.ISSUED
        if self.status != new_status:
            self.status = new_status
            self.save(update_fields=["status", "updated_at"])

    def __str__(self) -> str:
        return self.invoice_number


class ChargeType(models.TextChoices):
    RENT = "RENT", "Rent"
    WATER = "WATER", "Water"
    GARBAGE = "GARBAGE", "Garbage"
    SERVICE_CHARGE = "SERVICE_CHARGE", "Service Charge"
    OTHER = "OTHER", "Other"


class InvoiceLine(TenantScopedModel):
    """Immutable line item snapshot on an issued invoice."""

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    charge_type = models.CharField(
        max_length=20,
        choices=ChargeType.choices,
        default=ChargeType.RENT,
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_amount = models.DecimalField(max_digits=14, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)


class AdjustmentType(models.TextChoices):
    CREDIT = "CREDIT", "Credit Note"
    DEBIT = "DEBIT", "Debit Note"


class InvoiceAdjustment(TenantScopedModel):
    """Post-issue credit or debit adjustment preserving original invoice lines."""

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name="adjustments",
    )
    adjustment_type = models.CharField(max_length=10, choices=AdjustmentType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=255)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_adjustments",
    )

    class Meta:
        ordering = ["-created_at"]
