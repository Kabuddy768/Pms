from rest_framework import serializers

from apps.leasing.models import Tenant
from apps.organizations.models import MembershipStatus, OrganizationMembership
from apps.properties.models import Property, Unit

from .models import MaintenanceRequest


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    unit_code = serializers.CharField(source="unit.unit_code", read_only=True, default=None)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True, default=None)
    assigned_to_email = serializers.EmailField(
        source="assigned_to.email", read_only=True, default=None
    )
    created_by_email = serializers.EmailField(
        source="created_by.email", read_only=True, default=None
    )

    class Meta:
        model = MaintenanceRequest
        fields = [
            "id",
            "property",
            "property_name",
            "unit",
            "unit_code",
            "tenant",
            "tenant_name",
            "title",
            "description",
            "priority",
            "status",
            "assigned_to",
            "assigned_to_email",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "property_name",
            "unit_code",
            "tenant_name",
            "assigned_to_email",
            "created_by_email",
            "created_at",
            "updated_at",
        ]

    def validate_property(self, value: Property) -> Property:
        if value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Property does not belong to your organization.")
        return value

    def validate_unit(self, value: Unit | None) -> Unit | None:
        if value and value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Unit does not belong to your organization.")
        return value

    def validate_tenant(self, value: Tenant | None) -> Tenant | None:
        if value and value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Tenant does not belong to your organization.")
        return value

    def validate_assigned_to(self, value):
        if value is None:
            return None
        org = self.context["organization"]
        is_member = OrganizationMembership.objects.filter(
            organization=org,
            user=value,
            status=MembershipStatus.ACTIVE,
        ).exists()
        if not is_member:
            raise serializers.ValidationError("Assigned user is not an active member.")
        return value

    def validate(self, attrs):
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        unit = attrs.get("unit") if "unit" in attrs else getattr(self.instance, "unit", None)
        if unit and prop and unit.property_id != prop.id:
            raise serializers.ValidationError(
                {"unit": "Selected unit does not belong to the selected property."}
            )
        return attrs
