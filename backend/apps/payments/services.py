import re
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.models import record_audit_event
from apps.billing.models import Invoice, InvoiceStatus, SequenceType, next_sequence_number
from apps.leasing.models import Lease, LeaseOccupant, LeaseStatus

from .models import (
    AllocationStatus,
    Payment,
    PaymentAllocation,
    PaymentReversal,
    PaymentStatus,
)


def normalize_account_ref(raw_ref: str) -> str:
    """Strip spaces, hyphens, and common Kenyan prefixes like 'HSE' or 'HOUSE'."""
    cleaned = raw_ref.strip().upper()
    cleaned = re.sub(r"^(HOUSE|HSE|UNIT|APT|RM)[\s\-:#]*", "", cleaned)
    cleaned = re.sub(r"[\s\-_]+", "", cleaned)
    return cleaned


def match_lease_for_callback(
    *, organization, raw_account_ref: str, payer_phone: str
) -> Lease | None:
    """Attempt Kenyan C2B auto-match by Unit.unit_code first, then unique Tenant.phone."""
    active_leases = Lease.objects.select_related("unit").filter(
        organization=organization, status=LeaseStatus.ACTIVE
    )

    if raw_account_ref:
        normalized_ref = normalize_account_ref(raw_account_ref)
        ref_upper = raw_account_ref.strip().upper()
        exact = [
            lease for lease in active_leases if lease.unit.unit_code.upper() == ref_upper
        ]
        if len(exact) == 1:
            return exact[0]
        fuzzy = [
            lease
            for lease in active_leases
            if normalize_account_ref(lease.unit.unit_code) == normalized_ref
        ]
        if len(fuzzy) == 1:
            return fuzzy[0]

    if payer_phone:
        phone_tail = re.sub(r"\D", "", payer_phone)[-9:]
        if len(phone_tail) == 9:
            occupants = (
                LeaseOccupant.objects.select_related("lease", "tenant")
                .filter(
                    organization=organization,
                    lease__status=LeaseStatus.ACTIVE,
                    tenant__phone__endswith=phone_tail,
                )
            )
            matched_leases = {occ.lease_id: occ.lease for occ in occupants}
            if len(matched_leases) == 1:
                return next(iter(matched_leases.values()))

    return None


@transaction.atomic
def allocate_payment_fifo(*, payment: Payment) -> list[PaymentAllocation]:
    """Allocate unallocated funds on a CONFIRMED payment to the lease's oldest unpaid invoices."""
    payment = Payment.objects.select_for_update().get(id=payment.id)
    if payment.status != PaymentStatus.CONFIRMED or not payment.lease_id:
        return []

    available = payment.unallocated_amount()
    if available <= Decimal("0.00"):
        return []

    unpaid_invoices = (
        Invoice.objects.select_for_update()
        .filter(
            organization=payment.organization,
            lease=payment.lease,
            status__in=[InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL],
        )
        .order_by("due_date", "issue_date", "created_at")
    )

    created_allocations: list[PaymentAllocation] = []
    for inv in unpaid_invoices:
        if available <= Decimal("0.00"):
            break
        outstanding = inv.outstanding_balance()
        if outstanding <= Decimal("0.00"):
            inv.refresh_status()
            continue

        apply_amount = min(available, outstanding)
        alloc = PaymentAllocation.objects.create(
            organization=payment.organization,
            payment=payment,
            invoice=inv,
            amount=apply_amount,
            status=AllocationStatus.ACTIVE,
        )
        inv.refresh_status()
        available -= apply_amount
        created_allocations.append(alloc)

    return created_allocations


@transaction.atomic
def allocate_payment_to_invoice(
    *, payment: Payment, invoice: Invoice, amount: Decimal | None = None
) -> PaymentAllocation:
    """Explicitly allocate funds from a payment to a specific invoice."""
    payment = Payment.objects.select_for_update().get(id=payment.id)
    invoice = Invoice.objects.select_for_update().get(id=invoice.id)

    if payment.organization_id != invoice.organization_id:
        raise ValidationError({"invoice": "Invoice does not belong to this organization."})
    if payment.status != PaymentStatus.CONFIRMED:
        raise ValidationError({"payment": "Only confirmed payments can be allocated."})
    if invoice.status == InvoiceStatus.VOID:
        raise ValidationError({"invoice": "Cannot allocate to a void invoice."})

    available = payment.unallocated_amount()
    outstanding = invoice.outstanding_balance()
    if available <= Decimal("0.00"):
        raise ValidationError({"amount": "Payment has no unallocated funds remaining."})
    if outstanding <= Decimal("0.00"):
        raise ValidationError({"invoice": "Invoice is already fully paid."})

    target_amount = amount if amount is not None else min(available, outstanding)
    if target_amount <= Decimal("0.00"):
        raise ValidationError({"amount": "Allocation amount must be positive."})
    if target_amount > available:
        raise ValidationError({"amount": f"Exceeds unallocated payment balance ({available})."})
    if target_amount > outstanding:
        raise ValidationError({"amount": f"Exceeds invoice outstanding balance ({outstanding})."})

    alloc = PaymentAllocation.objects.create(
        organization=payment.organization,
        payment=payment,
        invoice=invoice,
        amount=target_amount,
        status=AllocationStatus.ACTIVE,
    )
    invoice.refresh_status()
    return alloc


@transaction.atomic
def reverse_payment(*, payment: Payment, reason: str, actor_user) -> PaymentReversal:
    """Reverse a payment without deleting it, restoring affected invoice balances."""
    payment = Payment.objects.select_for_update().get(id=payment.id)
    if payment.status == PaymentStatus.REVERSED:
        raise ValidationError({"detail": "Payment is already reversed."})

    active_allocs = list(
        payment.allocations.select_related("invoice").filter(status=AllocationStatus.ACTIVE)
    )
    for alloc in active_allocs:
        alloc.status = AllocationStatus.REVERSED
        alloc.save(update_fields=["status", "updated_at"])
        alloc.invoice.refresh_status()

    payment.status = PaymentStatus.REVERSED
    payment.save(update_fields=["status", "updated_at"])

    reversal = PaymentReversal.objects.create(
        organization=payment.organization,
        payment=payment,
        amount=payment.amount,
        reason=reason,
        reversed_by=actor_user,
    )
    record_audit_event(
        organization=payment.organization,
        actor_user=actor_user,
        action="PAYMENT_REVERSED",
        entity_type="Payment",
        entity_id=payment.id,
        metadata={
            "payment_reference": payment.payment_reference,
            "amount": str(payment.amount),
            "reason": reason,
        },
    )
    return reversal


def ensure_receipt_number(payment: Payment) -> str:
    if payment.receipt_number:
        return payment.receipt_number
    receipt = next_sequence_number(
        organization=payment.organization,
        sequence_type=SequenceType.RECEIPT,
        year=payment.received_at.year,
    )
    payment.receipt_number = receipt
    payment.save(update_fields=["receipt_number", "updated_at"])
    return receipt
