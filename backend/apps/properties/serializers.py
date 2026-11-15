from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import (
    Building,
    Owner,
    Property,
    PropertyOwner,
    Unit,
    UnitStatus,
)


class PropertySerializer(serializers.ModelSerializer):
    unit_count = serializers.IntegerField(read_only=True, default=0)
    vacant_unit_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Property
        fields = [
            "id",
            "name",
            "property_type",
            "address",
            "county",
            "town",
            "status",
            "unit_count",
            "vacant_unit_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "unit_count", "vacant_unit_count", "created_at", "updated_at"]


class BuildingSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)

    class Meta:
        model = Building
        fields = ["id", "property", "property_name", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "property_name", "created_at", "updated_at"]

    def validate_property(self, value: Property) -> Property:
        org = self.context["organization"]
        if value.organization_id != org.id:
            raise serializers.ValidationError("Property does not belong to your organization.")
        return value

    def validate(self, attrs):
        org = self.context["organization"]
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        name = attrs.get("name") or getattr(self.instance, "name", "")
        qs = Building.objects.filter(organization=org, property=prop, name__iexact=name.strip())
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(
                {"name": "A building with this name already exists in this property."}
            )
        return attrs


class UnitSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    building_name = serializers.CharField(
        source="building.name", read_only=True, default=None
    )

    class Meta:
        model = Unit
        fields = [
            "id",
            "property",
            "property_name",
            "building",
            "building_name",
            "unit_code",
            "unit_type",
            "advertised_rent",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "property_name", "building_name", "created_at", "updated_at"]

    def validate_unit_code(self, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise serializers.ValidationError("Unit code cannot be blank.")
        return normalized

    def validate_advertised_rent(self, value: Decimal) -> Decimal:
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Advertised rent cannot be negative.")
        return value

    def validate_property(self, value: Property) -> Property:
        org = self.context["organization"]
        if value.organization_id != org.id:
            raise serializers.ValidationError("Property does not belong to your organization.")
        return value

    def validate_building(self, value: Building | None) -> Building | None:
        if value is None:
            return None
        org = self.context["organization"]
        if value.organization_id != org.id:
            raise serializers.ValidationError("Building does not belong to your organization.")
        return value

    def validate(self, attrs):
        org = self.context["organization"]
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        building = attrs.get("building") if "building" in attrs else getattr(
            self.instance, "building", None
        )
        unit_code = attrs.get("unit_code") or getattr(self.instance, "unit_code", "")

        if building and prop and building.property_id != prop.id:
            raise serializers.ValidationError(
                {"building": "Selected building does not belong to the selected property."}
            )

        qs = Unit.objects.filter(organization=org, property=prop, unit_code=unit_code)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(
                {"unit_code": "A unit with this code already exists in this property."}
            )

        if self.instance is None:
            active_units = (
                Unit.objects.filter(organization=org)
                .exclude(status=UnitStatus.ARCHIVED)
                .count()
            )
            if active_units >= org.unit_limit:
                raise serializers.ValidationError(
                    {"detail": f"Organization unit limit ({org.unit_limit}) reached."}
                )

        return attrs


class OwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Owner
        fields = ["id", "full_name", "phone", "email", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class PropertyOwnerSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_phone = serializers.CharField(source="owner.phone", read_only=True)
    owner_email = serializers.EmailField(source="owner.email", read_only=True)

    class Meta:
        model = PropertyOwner
        fields = [
            "id",
            "property",
            "owner",
            "owner_name",
            "owner_phone",
            "owner_email",
            "ownership_share",
            "valid_from",
            "valid_to",
            "created_at",
        ]
        read_only_fields = ["id", "owner_name", "owner_phone", "owner_email", "created_at"]


class PropertyOwnerAssignmentItemSerializer(serializers.Serializer):
    owner = serializers.UUIDField()
    ownership_share = serializers.DecimalField(max_digits=5, decimal_places=2)
    valid_from = serializers.DateField()

    def validate_ownership_share(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00") or value > Decimal("100.00"):
            raise serializers.ValidationError("Ownership share must be between 0.01 and 100.00.")
        return value


class SetPropertyOwnersSerializer(serializers.Serializer):
    owners = PropertyOwnerAssignmentItemSerializer(many=True)

    def validate_owners(self, items):
        if not items:
            return items
        total = sum((item["ownership_share"] for item in items), Decimal("0.00"))
        if total != Decimal("100.00"):
            raise serializers.ValidationError(
                f"Active ownership shares must sum to 100.00% (got {total}%)."
            )
        owner_ids = [item["owner"] for item in items]
        if len(owner_ids) != len(set(owner_ids)):
            raise serializers.ValidationError("Duplicate owner in assignment list.")
        return items

    @transaction.atomic
    def save(self, *, property_obj: Property, organization):
        items = self.validated_data["owners"]
        owner_ids = [item["owner"] for item in items]
        owners_by_id = {
            o.id: o for o in Owner.objects.filter(organization=organization, id__in=owner_ids)
        }
        if len(owners_by_id) != len(owner_ids):
            raise serializers.ValidationError(
                {"owners": "One or more owners do not belong to your organization."}
            )

        PropertyOwner.objects.filter(
            organization=organization,
            property=property_obj,
            valid_to__isnull=True,
        ).delete()

        created = []
        for item in items:
            created.append(
                PropertyOwner.objects.create(
                    organization=organization,
                    property=property_obj,
                    owner=owners_by_id[item["owner"]],
                    ownership_share=item["ownership_share"],
                    valid_from=item["valid_from"],
                )
            )
        return created
