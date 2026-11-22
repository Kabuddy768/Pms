from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from apps.core.models import TenantScopedModel
from apps.properties.models import Unit


class TenantStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    ARCHIVED = "ARCHIVED", "Archived"


class Tenant(TenantScopedModel):
    """Organization-scoped tenant profile with minimal PII."""

    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32)
    email = models.EmailField(blank=True)
    national_id = models.CharField(max_length=32, blank=True)
    kra_pin = models.CharField(max_length=20, blank=True, default="")
    sms_opt_in = models.BooleanField(default=True)
    email_opt_in = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20,
        choices=TenantStatus.choices,
        default=TenantStatus.ACTIVE,
    )

    class Meta:
        ordering = ["full_name"]
        indexes = [
            models.Index(fields=["organization", "phone"]),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.phone})"


class BillingFrequency(models.TextChoices):
    MONTHLY = "MONTHLY", "Monthly"
    QUARTERLY = "QUARTERLY", "Quarterly"
    ANNUALLY = "ANNUALLY", "Annually"


class LeaseStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    TERMINATED = "TERMINATED", "Terminated"
    EXPIRED = "EXPIRED", "Expired"


class Lease(TenantScopedModel):
    """Occupancy agreement for a specific Unit."""

    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name="leases",
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    rent_amount = models.DecimalField(max_digits=14, decimal_places=2)
    billing_frequency = models.CharField(
        max_length=20,
        choices=BillingFrequency.choices,
        default=BillingFrequency.MONTHLY,
    )
    billing_day = models.PositiveSmallIntegerField(default=5)
    status = models.CharField(
        max_length=20,
        choices=LeaseStatus.choices,
        default=LeaseStatus.ACTIVE,
    )

    class Meta:
        ordering = ["-start_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["unit"],
                condition=Q(status=LeaseStatus.ACTIVE),
                name="uniq_active_lease_per_unit",
            )
        ]

    def clean(self):
        if self.unit_id and self.organization_id:
            if self.unit.organization_id != self.organization_id:
                raise ValidationError("Lease unit must belong to the same organization.")
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError("End date cannot be earlier than start date.")
        if self.rent_amount is not None and self.rent_amount < Decimal("0.00"):
            raise ValidationError("Rent amount cannot be negative.")
        if not (1 <= self.billing_day <= 28):
            raise ValidationError("Billing day must be between 1 and 28.")

    def __str__(self) -> str:
        return f"Lease {self.unit.unit_code} ({self.status})"


class OccupantRole(models.TextChoices):
    PRIMARY = "PRIMARY", "Primary Tenant"
    CO_TENANT = "CO_TENANT", "Co-Tenant"
    OCCUPANT = "OCCUPANT", "Occupant"


class LeaseOccupant(TenantScopedModel):
    """Links a Tenant to a Lease with an explicit occupant role."""

    lease = models.ForeignKey(
        Lease,
        on_delete=models.CASCADE,
        related_name="occupants",
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.PROTECT,
        related_name="lease_occupancies",
    )
    occupant_role = models.CharField(
        max_length=20,
        choices=OccupantRole.choices,
        default=OccupantRole.PRIMARY,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "lease", "tenant"],
                name="uniq_lease_occupant_per_org",
            )
        ]

    def clean(self):
        if self.lease_id and self.organization_id:
            if self.lease.organization_id != self.organization_id:
                raise ValidationError("Lease must belong to the same organization.")
        if self.tenant_id and self.organization_id:
            if self.tenant.organization_id != self.organization_id:
                raise ValidationError("Tenant must belong to the same organization.")


class LeaseEventType(models.TextChoices):
    CREATED = "CREATED", "Created"
    ACTIVATED = "ACTIVATED", "Activated"
    RENEWED = "RENEWED", "Renewed"
    RENT_AMENDED = "RENT_AMENDED", "Rent Amended"
    TERMINATED = "TERMINATED", "Terminated"
    EXPIRED = "EXPIRED", "Expired"


class LeaseEvent(TenantScopedModel):
    """Immutable history of lease lifecycle and term changes."""

    lease = models.ForeignKey(
        Lease,
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(max_length=32, choices=LeaseEventType.choices)
    details = models.JSONField(default=dict, blank=True)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lease_events",
    )
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]


class DepositStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PARTIAL = "PARTIAL", "Partial"
    HELD = "HELD", "Held"
    SETTLED = "SETTLED", "Settled"


class DepositAccount(TenantScopedModel):
    """Security deposit account for a lease."""

    lease = models.OneToOneField(
        Lease,
        on_delete=models.PROTECT,
        related_name="deposit_account",
    )
    required_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    status = models.CharField(
        max_length=20,
        choices=DepositStatus.choices,
        default=DepositStatus.PENDING,
    )

    def held_balance(self) -> Decimal:
        received = Decimal("0.00")
        outflow = Decimal("0.00")
        for tx in self.transactions.all():
            if tx.transaction_type == DepositTransactionType.RECEIVED:
                received += tx.amount
            else:
                outflow += tx.amount
        return received - outflow

    def refresh_status(self):
        held = self.held_balance()
        has_tx = self.transactions.exists()
        if self.required_amount == Decimal("0.00") and not has_tx:
            new_status = DepositStatus.PENDING
        elif held <= Decimal("0.00") and has_tx:
            new_status = DepositStatus.SETTLED
        elif held >= self.required_amount and self.required_amount > Decimal("0.00"):
            new_status = DepositStatus.HELD
        elif held > Decimal("0.00"):
            new_status = DepositStatus.PARTIAL
        else:
            new_status = DepositStatus.PENDING
        if self.status != new_status:
            self.status = new_status
            self.save(update_fields=["status", "updated_at"])


class DepositTransactionType(models.TextChoices):
    RECEIVED = "RECEIVED", "Received"
    DEDUCTED = "DEDUCTED", "Deducted"
    REFUNDED = "REFUNDED", "Refunded"


class DepositTransaction(TenantScopedModel):
    """Append-only deposit ledger entry."""

    deposit_account = models.ForeignKey(
        DepositAccount,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=DepositTransactionType.choices,
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deposit_transactions",
    )
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
