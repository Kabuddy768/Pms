from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, require_org_roles

from .models import (
    MembershipStatus,
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from .serializers import (
    AddOrganizationMemberSerializer,
    OrganizationMemberSerializer,
    OrganizationSerializer,
    UpdateOrganizationMemberSerializer,
)


class OrganizationListCreateView(generics.ListCreateAPIView):
    """List organizations the user belongs to, or create a new organization."""

    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        return Organization.objects.filter(
            memberships__user=self.request.user,
            memberships__status=MembershipStatus.ACTIVE,
        ).distinct()


class CurrentOrganizationView(APIView):
    """Return details for the organization specified in X-Organization-ID."""

    permission_classes = [HasOrganizationMembership]

    def get(self, request):
        serializer = OrganizationSerializer(
            request.organization, context={"request": request}
        )
        return Response(serializer.data)

    def patch(self, request):
        if request.membership.role not in (OrganizationRole.OWNER, OrganizationRole.MANAGER):
            raise PermissionDenied("Only OWNER or MANAGER can update organization settings.")
        serializer = OrganizationSerializer(
            request.organization,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class OrganizationMemberListCreateView(generics.ListCreateAPIView):
    """List members of the active organization or add a new member (OWNER/MANAGER)."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [require_org_roles(OrganizationRole.OWNER, OrganizationRole.MANAGER)()]
        return [HasOrganizationMembership()]

    def get_queryset(self):
        return OrganizationMembership.objects.select_related("user").filter(
            organization=self.request.organization
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AddOrganizationMemberSerializer
        return OrganizationMemberSerializer

    def create(self, request, *args, **kwargs):
        serializer = AddOrganizationMemberSerializer(
            data=request.data,
            context={"organization": request.organization, "actor": request.user},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(
            OrganizationMemberSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )


class OrganizationMemberDetailView(APIView):
    """Update a member's role or status within the active organization (OWNER/MANAGER)."""

    permission_classes = [require_org_roles(OrganizationRole.OWNER, OrganizationRole.MANAGER)]

    @transaction.atomic
    def patch(self, request, member_id):
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related("user"),
            id=member_id,
            organization=request.organization,
        )
        serializer = UpdateOrganizationMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        new_role = data.get("role", membership.role)
        new_status = data.get("status", membership.status)

        is_losing_owner = (
            membership.role == OrganizationRole.OWNER
            and membership.status == MembershipStatus.ACTIVE
            and (new_role != OrganizationRole.OWNER or new_status != MembershipStatus.ACTIVE)
        )
        if is_losing_owner:
            other_active_owners = OrganizationMembership.objects.filter(
                organization=request.organization,
                role=OrganizationRole.OWNER,
                status=MembershipStatus.ACTIVE,
            ).exclude(id=membership.id)
            if not other_active_owners.exists():
                raise ValidationError(
                    {"detail": "Cannot remove or demote the last active organization owner."}
                )

        old_role, old_status = membership.role, membership.status
        membership.role = new_role
        membership.status = new_status
        membership.save(update_fields=["role", "status", "updated_at"])

        record_audit_event(
            organization=request.organization,
            actor_user=request.user,
            action="MEMBER_UPDATED",
            entity_type="OrganizationMembership",
            entity_id=membership.id,
            metadata={
                "member_email": membership.user.email,
                "old_role": old_role,
                "new_role": new_role,
                "old_status": old_status,
                "new_status": new_status,
            },
        )
        return Response(OrganizationMemberSerializer(membership).data)
