from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.audit.models import record_audit_event
from apps.leasing.models import Lease

from .models import (
    AdjustmentType,
    ChargeType,
    Invoice,
    InvoiceAdjustment,
    InvoiceLine,
    InvoiceStatus,
    SequenceType,
    next_sequence_number,
)


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["id", "charge_type", "description", "quantity", "unit_amount", "line_total"]


class InvoiceAdjustmentSerializer(serializers.ModelSerializer):
    approved_by_email = serializers.EmailField(
        source="approved_by.email", read_only=True, default=None
    )

    class Meta:
        model = InvoiceAdjustment
        fields = [
            "id",
            "adjustment_type",
            "amount",
            "reason",
            "approved_by_email",
            "created_at",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source="lease.unit.unit_code", read_only=True)
    property_name = serializers.CharField(source="lease.unit.property.name", read_only=True)
    tenant_name = serializers.SerializerMethodField()
    tenant_phone = serializers.SerializerMethodField()
    adjusted_total = serializers.SerializerMethodField()
    allocated_amount = serializers.SerializerMethodField()
    outstanding_balance = serializers.SerializerMethodField()
    lines = InvoiceLineSerializer(many=True, read_only=True)
    adjustments = InvoiceAdjustmentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "lease",
            "unit_code",
            "property_name",
            "tenant_name",
            "tenant_phone",
            "invoice_number",
            "billing_period",
            "issue_date",
            "due_date",
            "currency",
            "total_amount",
            "adjusted_total",
            "allocated_amount",
            "outstanding_balance",
            "status",
            "lines",
            "adjustments",
            "created_at",
        ]

    def get_tenant_name(self, obj: Invoice) -> str:
        occ = obj.lease.occupants.first()
        return occ.tenant.full_name if occ else "—"

    def get_tenant_phone(self, obj: Invoice) -> str:
        occ = obj.lease.occupants.first()
        return occ.tenant.phone if occ else ""

    def get_adjusted_total(self, obj: Invoice) -> str:
        return f"{obj.adjusted_total():.2f}"

    def get_allocated_amount(self, obj: Invoice) -> str:
        return f"{obj.allocated_amount():.2f}"

    def get_outstanding_balance(self, obj: Invoice) -> str:
        return f"{obj.outstanding_balance():.2f}"


class InvoiceLineInputSerializer(serializers.Serializer):
    charge_type = serializers.ChoiceField(choices=ChargeType.choices, default=ChargeType.RENT)
    description = serializers.CharField(max_length=255)
    quantity = serializers.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("1.00")
    )
    unit_amount = serializers.DecimalField(max_digits=14, decimal_places=2)

    def validate_quantity(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_amount(self, value: Decimal) -> Decimal:
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Unit amount cannot be negative.")
        return value


class InvoiceCreateSerializer(serializers.Serializer):
    lease = serializers.UUIDField()
    billing_period = serializers.RegexField(
        regex=r"^(\d{4}-\d{2})?$",
        required=False,
        default="",
        allow_blank=True,
    )
    issue_date = serializers.DateField()
    due_date = serializers.DateField()
    lines = InvoiceLineInputSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one invoice line is required.")
        return value

    def validate(self, attrs):
        if attrs["due_date"] < attrs["issue_date"]:
            raise serializers.ValidationError(
                {"due_date": "Due date cannot be earlier than issue date."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        org = self.context["organization"]
        actor = self.context["actor"]
        lease = Lease.objects.filter(organization=org, id=validated_data["lease"]).first()
        if not lease:
            raise serializers.ValidationError(
                {"lease": "Lease does not belong to your organization."}
            )

        period = validated_data.get("billing_period", "")
        if period and Invoice.objects.filter(
            organization=org, lease=lease, billing_period=period
        ).exists():
            raise serializers.ValidationError(
                {"billing_period": f"Invoice for {period} already exists for this lease."}
            )

        lines_data = validated_data["lines"]
        total_amount = Decimal("0.00")
        prepared_lines = []
        for item in lines_data:
            line_total = (item["quantity"] * item["unit_amount"]).quantize(Decimal("0.01"))
            total_amount += line_total
            prepared_lines.append({**item, "line_total": line_total})

        inv_number = next_sequence_number(
            organization=org,
            sequence_type=SequenceType.INVOICE,
            year=validated_data["issue_date"].year,
        )
        invoice = Invoice.objects.create(
            organization=org,
            lease=lease,
            invoice_number=inv_number,
            billing_period=period,
            issue_date=validated_data["issue_date"],
            due_date=validated_data["due_date"],
            currency=org.default_currency,
            total_amount=total_amount,
            status=InvoiceStatus.ISSUED,
        )
        for line in prepared_lines:
            InvoiceLine.objects.create(
                organization=org,
                invoice=invoice,
                **line,
            )

        record_audit_event(
            organization=org,
            actor_user=actor,
            action="INVOICE_ISSUED",
            entity_type="Invoice",
            entity_id=invoice.id,
            metadata={"invoice_number": inv_number, "total_amount": str(total_amount)},
        )
        return invoice


class GenerateMonthlyInvoicesSerializer(serializers.Serializer):
    billing_period = serializers.RegexField(regex=r"^\d{4}-\d{2}$")


class InvoiceAdjustmentCreateSerializer(serializers.Serializer):
    adjustment_type = serializers.ChoiceField(choices=AdjustmentType.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.CharField(max_length=255)

    def validate_amount(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Adjustment amount must be positive.")
        return value
