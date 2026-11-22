from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.audit.models import record_audit_event
from apps.leasing.models import Lease
from apps.properties.models import Unit

from .models import (
    AdjustmentType,
    ChargeType,
    Invoice,
    InvoiceAdjustment,
    InvoiceLine,
    InvoiceStatus,
    SequenceType,
    UtilityMeterReading,
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


class UtilityMeterReadingSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source="unit.unit_code", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    units_consumed = serializers.SerializerMethodField()
    billed_invoice_number = serializers.CharField(
        source="billed_invoice.invoice_number", read_only=True, default=None
    )
    recorded_by_email = serializers.EmailField(
        source="recorded_by.email", read_only=True, default=None
    )

    class Meta:
        model = UtilityMeterReading
        fields = [
            "id",
            "unit",
            "unit_code",
            "property_name",
            "charge_type",
            "billing_period",
            "previous_reading",
            "current_reading",
            "units_consumed",
            "unit_rate",
            "total_amount",
            "billed_invoice",
            "billed_invoice_number",
            "recorded_by_email",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "unit_code",
            "property_name",
            "units_consumed",
            "total_amount",
            "billed_invoice",
            "billed_invoice_number",
            "recorded_by_email",
            "created_at",
        ]

    def get_units_consumed(self, obj: UtilityMeterReading) -> str:
        return f"{(obj.current_reading - obj.previous_reading):.2f}"

    def validate_billing_period(self, value: str) -> str:
        import re

        cleaned = value.strip()
        if not re.match(r"^\d{4}-\d{2}$", cleaned):
            raise serializers.ValidationError("Billing period must use YYYY-MM format.")
        return cleaned

    def validate_unit(self, value: Unit) -> Unit:
        if value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Unit does not belong to your organization.")
        return value

    def validate(self, attrs):
        if self.instance and self.instance.billed_invoice_id is not None:
            raise serializers.ValidationError(
                {"detail": "Cannot modify a meter reading that has already been billed."}
            )
        prev = attrs.get(
            "previous_reading", getattr(self.instance, "previous_reading", None)
        )
        curr = attrs.get(
            "current_reading", getattr(self.instance, "current_reading", None)
        )
        rate = attrs.get("unit_rate", getattr(self.instance, "unit_rate", None))
        if prev is not None and prev < Decimal("0.00"):
            raise serializers.ValidationError(
                {"previous_reading": "Previous reading cannot be negative."}
            )
        if prev is not None and curr is not None and curr < prev:
            raise serializers.ValidationError(
                {"current_reading": "Current reading cannot be less than previous reading."}
            )
        if rate is not None and rate < Decimal("0.00"):
            raise serializers.ValidationError({"unit_rate": "Unit rate cannot be negative."})

        unit = attrs.get("unit", getattr(self.instance, "unit", None))
        charge_type = attrs.get(
            "charge_type", getattr(self.instance, "charge_type", None)
        )
        period = attrs.get(
            "billing_period", getattr(self.instance, "billing_period", None)
        )
        org = self.context["organization"]
        qs = UtilityMeterReading.objects.filter(
            organization=org,
            unit=unit,
            charge_type=charge_type,
            billing_period=period,
        )
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(
                {
                    "billing_period": (
                        "A meter reading for this unit, charge type, and period already exists."
                    )
                }
            )
        return attrs
