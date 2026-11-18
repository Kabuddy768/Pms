from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.billing.models import Invoice
from apps.core.models import TenantScopedModel
from apps.leasing.models import Lease, Tenant


class PaymentMethod(models.TextChoices):
    MPESA_PAYBILL = "MPESA_PAYBILL", "M-Pesa Paybill"
    MPESA_STK = "MPESA_STK", "M-Pesa STK Push"
    BANK_TRANSFER = "BANK_TRANSFER", "Bank Transfer"
    CASH = "CASH", "Cash"
    CHEQUE = "CHEQUE", "Cheque"


class PaymentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CONFIRMED = "CONFIRMED", "Confirmed"
    REVERSED = "REVERSED", "Reversed"
    FAILED = "FAILED", "Failed"


class Payment(TenantScopedModel):
    """Receipt of funds; nullable lease/tenant supports unmatched C2B/Bank suspense queue."""

    lease = models.ForeignKey(
        Lease,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    payment_reference = models.CharField(max_length=100)
    receipt_number = models.CharField(max_length=40, blank=True, default="")
    method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.MPESA_PAYBILL,
    )
    currency = models.CharField(max_length=3, default="KES")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    received_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.CONFIRMED,
    )
    payer_name = models.CharField(max_length=255, blank=True)
    payer_phone = models.CharField(max_length=32, blank=True)
    raw_account_ref = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-received_at", "-created_at"]
        indexes = [
            models.Index(
                fields=["organization", "status", "received_at"],
                name="idx_payment_org_status_recv",
            ),
            models.Index(
                fields=["organization", "lease", "status"],
                name="idx_payment_org_lease_status",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "payment_reference"],
                name="uniq_payment_ref_per_org",
            ),
            models.UniqueConstraint(
                fields=["organization", "receipt_number"],
                condition=~models.Q(receipt_number=""),
                name="uniq_receipt_number_per_org",
            ),
        ]

    def clean(self):
        if self.lease_id and self.organization_id:
            if self.lease.organization_id != self.organization_id:
                raise ValidationError("Payment lease must belong to the same organization.")
        if self.tenant_id and self.organization_id:
            if self.tenant.organization_id != self.organization_id:
                raise ValidationError("Payment tenant must belong to the same organization.")

    def allocated_amount(self) -> Decimal:
        return sum(
            (a.amount for a in self.allocations.filter(status=AllocationStatus.ACTIVE)),
            Decimal("0.00"),
        )

    def unallocated_amount(self) -> Decimal:
        if self.status != PaymentStatus.CONFIRMED:
            return Decimal("0.00")
        return max(Decimal("0.00"), self.amount - self.allocated_amount())

    def __str__(self) -> str:
        return f"{self.payment_reference} ({self.amount} {self.currency})"


class AllocationStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    REVERSED = "REVERSED", "Reversed"


class PaymentAllocation(TenantScopedModel):
    """Applies a portion of a Payment to a specific Invoice."""

    payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=AllocationStatus.choices,
        default=AllocationStatus.ACTIVE,
    )
    allocated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-allocated_at"]


class PaymentReversal(TenantScopedModel):
    """Immutable reversal record preserving the original Payment."""

    payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        related_name="reversals",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=255)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_reversals",
    )
    reversed_at = models.DateTimeField(auto_now_add=True)


class ProviderTransaction(TenantScopedModel):
    """Raw idempotent provider callback record (e.g., M-Pesa Daraja C2B / STK)."""

    payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="provider_transactions",
    )
    provider = models.CharField(max_length=32, default="MPESA")
    provider_reference = models.CharField(max_length=100)
    processing_status = models.CharField(max_length=32, default="RECEIVED")
    safe_payload = models.JSONField(default=dict, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "provider", "provider_reference"],
                name="uniq_provider_ref_per_org",
            )
        ]
