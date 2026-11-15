from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from apps.audit.models import record_audit_event

from .models import (
    MembershipStatus,
    Organization,
    OrganizationMembership,
    OrganizationRole,
)

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "default_currency",
            "timezone",
            "plan_tier",
            "unit_limit",
            "created_at",
            "role",
        ]
        read_only_fields = ["id", "slug", "plan_tier", "unit_limit", "created_at", "role"]

    def get_role(self, obj) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.memberships.filter(
            user=request.user,
            status=MembershipStatus.ACTIVE,
        ).first()
        return membership.role if membership else None

    @transaction.atomic
    def create(self, validated_data):
        user = self.context["request"].user
        org = Organization.objects.create(**validated_data)
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
        return org


class OrganizationMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "user",
            "email",
            "full_name",
            "role",
            "status",
            "joined_at",
        ]
        read_only_fields = ["id", "user", "email", "full_name", "joined_at"]


class AddOrganizationMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    password = serializers.CharField(
        required=False, allow_blank=True, default="", write_only=True
    )
    role = serializers.ChoiceField(
        choices=OrganizationRole.choices,
        default=OrganizationRole.MANAGER,
    )

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    @transaction.atomic
    def create(self, validated_data):
        organization = self.context["organization"]
        actor = self.context["actor"]
        email = validated_data["email"]
        full_name = validated_data.get("full_name", "").strip()
        password = validated_data.get("password", "")
        role = validated_data["role"]

        user = User.objects.filter(email=email).first()
        if not user:
            if not password:
                raise serializers.ValidationError(
                    {
                        "email": (
                            "No registered user found with this email. Enter an initial "
                            "password (min 8 characters) to create their account directly."
                        )
                    }
                )
            if len(password) < 8:
                raise serializers.ValidationError(
                    {"password": "Password must be at least 8 characters."}
                )
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name or email.split("@")[0],
            )

        if OrganizationMembership.objects.filter(
            organization=organization, user=user
        ).exists():
            raise serializers.ValidationError(
                {"email": "User is already a member of this organization."}
            )

        membership = OrganizationMembership.objects.create(
            organization=organization,
            user=user,
            role=role,
            status=MembershipStatus.ACTIVE,
        )
        record_audit_event(
            organization=organization,
            actor_user=actor,
            action="MEMBER_ADDED",
            entity_type="OrganizationMembership",
            entity_id=membership.id,
            metadata={"member_email": user.email, "role": role},
        )
        return membership


class UpdateOrganizationMemberSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=OrganizationRole.choices, required=False)
    status = serializers.ChoiceField(choices=MembershipStatus.choices, required=False)
