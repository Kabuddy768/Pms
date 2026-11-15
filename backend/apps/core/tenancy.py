import uuid

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission


def resolve_active_membership(request):
    """Resolve and cache the authenticated user's active membership for X-Organization-ID."""
    if hasattr(request, "_cached_membership"):
        return request._cached_membership

    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return None

    raw_org_id = request.headers.get("X-Organization-ID")
    if not raw_org_id:
        return None

    try:
        org_uuid = uuid.UUID(str(raw_org_id))
    except ValueError:
        return None

    from apps.organizations.models import MembershipStatus, OrganizationMembership

    membership = (
        OrganizationMembership.objects.select_related("organization")
        .filter(
            user=user,
            organization_id=org_uuid,
            status=MembershipStatus.ACTIVE,
        )
        .first()
    )
    request._cached_membership = membership
    return membership


class HasOrganizationMembership(BasePermission):
    """Require a valid X-Organization-ID header matching an ACTIVE OrganizationMembership."""

    message = "Valid X-Organization-ID header for an active organization membership is required."

    def has_permission(self, request, view):
        membership = resolve_active_membership(request)
        if not membership:
            return False
        request.organization = membership.organization
        request.membership = membership
        return True


def require_org_roles(*allowed_roles: str):
    """Factory returning a DRF permission class restricted to specific organization roles."""

    class RolePermission(BasePermission):
        message = "You do not have the required organization role for this action."

        def has_permission(self, request, view):
            membership = resolve_active_membership(request)
            if not membership:
                return False
            request.organization = membership.organization
            request.membership = membership
            return membership.role in allowed_roles

    RolePermission.__name__ = f"RequireRoles_{'_'.join(allowed_roles)}"
    return RolePermission


class TenantScopedMixin:
    """Mixin for DRF views/viewsets that enforces organization-scoped querysets and creates."""

    permission_classes = [HasOrganizationMembership]

    def get_organization(self):
        membership = resolve_active_membership(self.request)
        if not membership:
            raise PermissionDenied("Active organization membership is required.")
        return membership.organization

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(organization=self.get_organization())

    def perform_create(self, serializer):
        serializer.save(organization=self.get_organization())
