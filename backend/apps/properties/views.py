from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.organizations.models import OrganizationRole

from .models import Building, Owner, Property, PropertyOwner, PropertyStatus, Unit, UnitStatus
from .serializers import (
    BuildingSerializer,
    OwnerSerializer,
    PropertyOwnerSerializer,
    PropertySerializer,
    SetPropertyOwnersSerializer,
    UnitSerializer,
)

PORTFOLIO_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)


class PortfolioRoleMixin(TenantScopedMixin):
    """Allow read access to all active org members; restrict writes to non-caretaker roles."""

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        return [require_org_roles(*PORTFOLIO_WRITE_ROLES)()]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx


class PropertyViewSet(PortfolioRoleMixin, viewsets.ModelViewSet):
    serializer_class = PropertySerializer
    queryset = Property.objects.annotate(
        unit_count=Count("units", filter=~Q(units__status=UnitStatus.ARCHIVED)),
        vacant_unit_count=Count("units", filter=Q(units__status=UnitStatus.VACANT)),
    ).order_by("name")
    filterset_fields = ["property_type", "status", "county"]
    search_fields = ["name", "address", "county", "town"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        prop = serializer.save(organization=self.get_organization())
        record_audit_event(
            organization=prop.organization,
            actor_user=self.request.user,
            action="PROPERTY_CREATED",
            entity_type="Property",
            entity_id=prop.id,
            metadata={"name": prop.name, "property_type": prop.property_type},
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        prop = self.get_object()
        prop.status = PropertyStatus.ARCHIVED
        prop.save(update_fields=["status", "updated_at"])
        record_audit_event(
            organization=prop.organization,
            actor_user=request.user,
            action="PROPERTY_ARCHIVED",
            entity_type="Property",
            entity_id=prop.id,
            metadata={"name": prop.name},
        )
        return Response(PropertySerializer(prop).data)

    @action(detail=True, methods=["get", "post"], url_path="owners")
    def owners(self, request, pk=None):
        prop = self.get_object()
        if request.method == "GET":
            links = PropertyOwner.objects.select_related("owner").filter(
                organization=prop.organization,
                property=prop,
                valid_to__isnull=True,
            )
            return Response(PropertyOwnerSerializer(links, many=True).data)

        serializer = SetPropertyOwnersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        links = serializer.save(property_obj=prop, organization=prop.organization)
        record_audit_event(
            organization=prop.organization,
            actor_user=request.user,
            action="PROPERTY_OWNERS_UPDATED",
            entity_type="Property",
            entity_id=prop.id,
            metadata={"owner_count": len(links)},
        )
        return Response(
            PropertyOwnerSerializer(links, many=True).data,
            status=status.HTTP_200_OK,
        )


class BuildingViewSet(PortfolioRoleMixin, viewsets.ModelViewSet):
    serializer_class = BuildingSerializer
    queryset = Building.objects.select_related("property").all()
    filterset_fields = ["property"]
    search_fields = ["name", "property__name"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class UnitViewSet(PortfolioRoleMixin, viewsets.ModelViewSet):
    serializer_class = UnitSerializer
    queryset = Unit.objects.select_related("property", "building").all()
    filterset_fields = ["property", "building", "unit_type", "status"]
    search_fields = ["unit_code", "property__name", "building__name"]
    ordering_fields = ["unit_code", "advertised_rent", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        unit = serializer.save(organization=self.get_organization())
        record_audit_event(
            organization=unit.organization,
            actor_user=self.request.user,
            action="UNIT_CREATED",
            entity_type="Unit",
            entity_id=unit.id,
            metadata={
                "property_id": str(unit.property_id),
                "unit_code": unit.unit_code,
                "advertised_rent": str(unit.advertised_rent),
            },
        )


class OwnerViewSet(PortfolioRoleMixin, viewsets.ModelViewSet):
    serializer_class = OwnerSerializer
    queryset = Owner.objects.all()
    search_fields = ["full_name", "phone", "email"]
    http_method_names = ["get", "post", "patch", "head", "options"]
