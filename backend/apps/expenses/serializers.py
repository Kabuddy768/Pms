from decimal import Decimal

from rest_framework import serializers

from apps.properties.models import Property, Unit

from .models import Expense, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_name(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Category name cannot be blank.")
        org = self.context["organization"]
        qs = ExpenseCategory.objects.filter(organization=org, name__iexact=cleaned)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError("Expense category already exists.")
        return cleaned


class ExpenseSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    unit_code = serializers.CharField(source="unit.unit_code", read_only=True, default=None)
    category_name = serializers.CharField(source="category.name", read_only=True)
    recorded_by_email = serializers.EmailField(
        source="recorded_by.email", read_only=True, default=None
    )
    approved_by_email = serializers.EmailField(
        source="approved_by.email", read_only=True, default=None
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "property",
            "property_name",
            "unit",
            "unit_code",
            "category",
            "category_name",
            "description",
            "amount",
            "currency",
            "expense_date",
            "status",
            "recorded_by_email",
            "approved_by_email",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "currency",
            "status",
            "recorded_by_email",
            "approved_by_email",
            "created_at",
        ]

    def validate_amount(self, value: Decimal) -> Decimal:
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Expense amount must be positive.")
        return value

    def validate_property(self, value: Property) -> Property:
        if value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Property does not belong to your organization.")
        return value

    def validate_unit(self, value: Unit | None) -> Unit | None:
        if value and value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Unit does not belong to your organization.")
        return value

    def validate_category(self, value: ExpenseCategory) -> ExpenseCategory:
        if value.organization_id != self.context["organization"].id:
            raise serializers.ValidationError("Category does not belong to your organization.")
        return value

    def validate(self, attrs):
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        unit = attrs.get("unit") if "unit" in attrs else getattr(self.instance, "unit", None)
        if unit and prop and unit.property_id != prop.id:
            raise serializers.ValidationError(
                {"unit": "Selected unit does not belong to the selected property."}
            )
        return attrs
