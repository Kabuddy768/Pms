from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.audit.models import record_audit_event
from apps.organizations.models import (
    MembershipStatus,
    Organization,
    OrganizationMembership,
    OrganizationRole,
)

User = get_user_model()


class MembershipSummarySerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)
    default_currency = serializers.CharField(source="organization.default_currency", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "organization_id",
            "organization_name",
            "organization_slug",
            "default_currency",
            "role",
            "status",
            "joined_at",
        ]


class UserMeSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "is_active", "created_at", "memberships"]

    def get_memberships(self, obj) -> list[dict]:
        qs = obj.memberships.select_related("organization").filter(
            status=MembershipStatus.ACTIVE
        )
        return MembershipSummarySerializer(qs, many=True).data


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, min_length=8)
    organization_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized

    @transaction.atomic
    def create(self, validated_data):
        org_name = (validated_data.pop("organization_name", "") or "").strip()
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data.get("full_name", ""),
        )
        if org_name:
            org = Organization.objects.create(name=org_name)
            OrganizationMembership.objects.create(
                organization=org,
                user=user,
                role=OrganizationRole.OWNER,
                status=MembershipStatus.ACTIVE,
            )
            record_audit_event(
                organization=org,
                actor_user=user,
                action="ORGANIZATION_CREATED",
                entity_type="Organization",
                entity_id=org.id,
                metadata={"name": org.name, "slug": org.slug},
            )
        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Normalize email before JWT authentication."""

    def validate(self, attrs):
        if "email" in attrs and isinstance(attrs["email"], str):
            attrs["email"] = attrs["email"].strip().lower()
        return super().validate(attrs)
