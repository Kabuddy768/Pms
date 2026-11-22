from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.audit.models import record_audit_event
from apps.properties.models import Unit, UnitStatus

from .models import (
    DepositAccount,
    DepositTransaction,
    DepositTransactionType,
    Lease,
    LeaseEvent,
    LeaseEventType,
    LeaseOccupant,
    LeaseStatus,
    OccupantRole,
    Tenant,
)


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            "id",
            "full_name",
            "phone",
            "email",
            "national_id",
            "kra_pin",
            "sms_opt_in",
            "email_opt_in",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Phone number is required.")
        return cleaned


class LeaseOccupantSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    tenant_phone = serializers.CharField(source="tenant.phone", read_only=True)

    class Meta:
        model = LeaseOccupant
        fields = ["id", "tenant", "tenant_name", "tenant_phone", "occupant_role"]


class LeaseEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor_user.email", read_only=True, default=None)

    class Meta:
        model = LeaseEvent
        fields = ["id", "event_type", "details", "actor_email", "occurred_at"]


class DepositTransactionSerializer(serializers.ModelSerializer):
    recorded_by_email = serializers.EmailField(
        source="recorded_by.email", read_only=True, default=None
    )

    class Meta:
        model = DepositTransaction
        fields = [
            "id",
            "transaction_type",
            "amount",
            "reference",
            "notes",
            "recorded_by_email",
            "occurred_at",
        ]


class DepositAccountSerializer(serializers.ModelSerializer):
    held_balance = serializers.SerializerMethodField()
    transactions = DepositTransactionSerializer(many=True, read_only=True)

    class Meta:
        model = DepositAccount
        fields = ["id", "required_amount", "held_balance", "status", "transactions"]

    def get_held_balance(self, obj: DepositAccount) -> str:
        return f"{obj.held_balance():.2f}"


class LeaseSerializer(serializers.ModelSerializer):
    unit_code = serializers.CharField(source="unit.unit_code", read_only=True)
    property_id = serializers.UUIDField(source="unit.property_id", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    occupants = LeaseOccupantSerializer(many=True, read_only=True)
    events = LeaseEventSerializer(many=True, read_only=True)
    deposit_account = DepositAccountSerializer(read_only=True)

    class Meta:
        model = Lease
        fields = [
            "id",
            "unit",
            "unit_code",
            "property_id",
            "property_name",
            "start_date",
            "end_date",
            "rent_amount",
            "billing_frequency",
            "billing_day",
            "status",
            "occupants",
            "deposit_account",
            "events",
            "created_at",
            "updated_at",
        ]


class LeaseOccupantInputSerializer(serializers.Serializer):
    tenant = serializers.UUIDField()
    occupant_role = serializers.ChoiceField(
        choices=OccupantRole.choices,
        default=OccupantRole.PRIMARY,
    )


class LeaseCreateSerializer(serializers.Serializer):
    unit = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    rent_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    billing_frequency = serializers.ChoiceField(
        choices=["MONTHLY", "QUARTERLY", "ANNUALLY"],
        default="MONTHLY",
    )
    billing_day = serializers.IntegerField(min_value=1, max_value=28, default=5)
    required_deposit = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    occupants = LeaseOccupantInputSerializer(many=True)

    def validate_rent_amount(self, value: Decimal) -> Decimal:
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Rent amount cannot be negative.")
        return value

    def validate_required_deposit(self, value: Decimal) -> Decimal:
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Required deposit cannot be negative.")
        return value

    def validate_occupants(self, value):
        if not value:
            raise serializers.ValidationError("At least one occupant is required.")
        tenant_ids = [item["tenant"] for item in value]
        if len(tenant_ids) != len(set(tenant_ids)):
            raise serializers.ValidationError("Duplicate tenant in occupants list.")
        return value

    def validate(self, attrs):
        if attrs.get("end_date") and attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be earlier than start date."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        org = self.context["organization"]
        actor = self.context["actor"]
        occupants_data = validated_data.pop("occupants")
        required_deposit = validated_data.pop("required_deposit")
        unit_id = validated_data.pop("unit")

        unit = Unit.objects.select_for_update().filter(organization=org, id=unit_id).first()
        if not unit:
            raise serializers.ValidationError(
                {"unit": "Unit does not belong to your organization."}
            )
        if unit.status == UnitStatus.ARCHIVED:
            raise serializers.ValidationError({"unit": "Cannot lease an archived unit."})
        if Lease.objects.filter(unit=unit, status=LeaseStatus.ACTIVE).exists():
            raise serializers.ValidationError(
                {"unit": "Unit already has an active lease."}
            )

        tenant_ids = [item["tenant"] for item in occupants_data]
        tenants_by_id = {
            t.id: t for t in Tenant.objects.filter(organization=org, id__in=tenant_ids)
        }
        if len(tenants_by_id) != len(tenant_ids):
            raise serializers.ValidationError(
                {"occupants": "One or more tenants do not belong to your organization."}
            )

        lease = Lease.objects.create(
            organization=org,
            unit=unit,
            status=LeaseStatus.ACTIVE,
            **validated_data,
        )
        for item in occupants_data:
            LeaseOccupant.objects.create(
                organization=org,
                lease=lease,
                tenant=tenants_by_id[item["tenant"]],
                occupant_role=item["occupant_role"],
            )

        DepositAccount.objects.create(
            organization=org,
            lease=lease,
            required_amount=required_deposit,
        )

        unit.status = UnitStatus.OCCUPIED
        unit.save(update_fields=["status", "updated_at"])

        LeaseEvent.objects.create(
            organization=org,
            lease=lease,
            event_type=LeaseEventType.CREATED,
            actor_user=actor,
            details={
                "rent_amount": str(lease.rent_amount),
                "start_date": lease.start_date.isoformat(),
                "required_deposit": str(required_deposit),
            },
        )
        record_audit_event(
            organization=org,
            actor_user=actor,
            action="LEASE_CREATED",
            entity_type="Lease",
            entity_id=lease.id,
            metadata={"unit_code": unit.unit_code, "rent_amount": str(lease.rent_amount)},
        )
        return lease


class AmendRentSerializer(serializers.Serializer):
    rent_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_rent_amount(self, value: Decimal) -> Decimal:
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Rent amount cannot be negative.")
        return value


class RenewLeaseSerializer(serializers.Serializer):
    end_date = serializers.DateField()
    rent_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )


class TerminateLeaseSerializer(serializers.Serializer):
    end_date = serializers.DateField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class DepositTransactionCreateSerializer(serializers.Serializer):
    transaction_type = serializers.ChoiceField(choices=DepositTransactionType.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_amount(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
