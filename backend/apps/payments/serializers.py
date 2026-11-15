from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.audit.models import record_audit_event
from apps.billing.models import Invoice
from apps.leasing.models import Lease

from .models import (
    Payment,
    PaymentAllocation,
    PaymentMethod,
    PaymentReversal,
    PaymentStatus,
)
from .services import (
    allocate_payment_fifo,
    allocate_payment_to_invoice,
    ensure_receipt_number,
)


class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ["id", "invoice", "invoice_number", "amount", "status", "allocated_at"]


class PaymentReversalSerializer(serializers.ModelSerializer):
    reversed_by_email = serializers.EmailField(
        source="reversed_by.email", read_only=True, default=None
    )

    class Meta:
        model = PaymentReversal
        fields = ["id", "amount", "reason", "reversed_by_email", "reversed_at"]


class PaymentSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source="lease.unit.unit_code", read_only=True, default=None)
    property_name = serializers.CharField(
        source="lease.unit.property.name", read_only=True, default=None
    )
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True, default=None)
    allocated_amount = serializers.SerializerMethodField()
    unallocated_amount = serializers.SerializerMethodField()
    is_matched = serializers.SerializerMethodField()
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    reversals = PaymentReversalSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "lease",
            "unit_code",
            "property_name",
            "tenant",
            "tenant_name",
            "payment_reference",
            "receipt_number",
            "method",
            "currency",
            "amount",
            "allocated_amount",
            "unallocated_amount",
            "is_matched",
            "received_at",
            "status",
            "payer_name",
            "payer_phone",
            "raw_account_ref",
            "allocations",
            "reversals",
            "created_at",
        ]

    def get_allocated_amount(self, obj: Payment) -> str:
        return f"{obj.allocated_amount():.2f}"

    def get_unallocated_amount(self, obj: Payment) -> str:
        return f"{obj.unallocated_amount():.2f}"

    def get_is_matched(self, obj: Payment) -> bool:
        return obj.lease_id is not None


class PaymentCreateSerializer(serializers.Serializer):
    lease = serializers.UUIDField(required=False, allow_null=True, default=None)
    invoice_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    payment_reference = serializers.CharField(max_length=100)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    received_at = serializers.DateTimeField(required=False, default=timezone.now)
    payer_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    payer_phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    raw_account_ref = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )
    auto_allocate = serializers.BooleanField(default=True)

    def validate_amount(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value

    def validate_payment_reference(self, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned:
            raise serializers.ValidationError("Payment reference is required.")
        org = self.context["organization"]
        if Payment.objects.filter(organization=org, payment_reference=cleaned).exists():
            raise serializers.ValidationError("A payment with this reference already exists.")
        return cleaned

    @transaction.atomic
    def create(self, validated_data):
        org = self.context["organization"]
        actor = self.context["actor"]
        lease_id = validated_data.pop("lease", None)
        invoice_id = validated_data.pop("invoice_id", None)
        auto_allocate = validated_data.pop("auto_allocate", True)

        lease = None
        tenant = None
        if lease_id:
            lease = Lease.objects.filter(organization=org, id=lease_id).first()
            if not lease:
                raise serializers.ValidationError(
                    {"lease": "Lease does not belong to your organization."}
                )
            primary = lease.occupants.first()
            tenant = primary.tenant if primary else None

        invoice = None
        if invoice_id:
            invoice = Invoice.objects.filter(organization=org, id=invoice_id).first()
            if not invoice:
                raise serializers.ValidationError(
                    {"invoice_id": "Invoice does not belong to your organization."}
                )
            if lease is None:
                lease = invoice.lease
                primary = lease.occupants.first()
                tenant = primary.tenant if primary else None

        payment = Payment.objects.create(
            organization=org,
            lease=lease,
            tenant=tenant,
            currency=org.default_currency,
            status=PaymentStatus.CONFIRMED,
            **validated_data,
        )
        ensure_receipt_number(payment)

        if invoice:
            allocate_payment_to_invoice(payment=payment, invoice=invoice)
        elif auto_allocate and lease:
            allocate_payment_fifo(payment=payment)

        record_audit_event(
            organization=org,
            actor_user=actor,
            action="PAYMENT_RECORDED",
            entity_type="Payment",
            entity_id=payment.id,
            metadata={
                "payment_reference": payment.payment_reference,
                "receipt_number": payment.receipt_number,
                "amount": str(payment.amount),
                "matched": lease is not None,
            },
        )
        return payment


class MpesaCallbackSerializer(serializers.Serializer):
    """M-Pesa Daraja C2B / STK callback payload."""

    trans_id = serializers.CharField(max_length=100)
    trans_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    bill_ref_number = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )
    msisdn = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    first_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class AssignPaymentSerializer(serializers.Serializer):
    lease = serializers.UUIDField()
    auto_allocate = serializers.BooleanField(default=True)


class AllocatePaymentSerializer(serializers.Serializer):
    invoice = serializers.UUIDField()
    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, default=None
    )


class ReversePaymentSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
