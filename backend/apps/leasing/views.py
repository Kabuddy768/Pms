from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.organizations.models import OrganizationRole
from apps.properties.models import UnitStatus

from .models import (
    DepositAccount,
    DepositTransaction,
    DepositTransactionType,
    Lease,
    LeaseEvent,
    LeaseEventType,
    LeaseStatus,
    Tenant,
)
from .serializers import (
    AmendRentSerializer,
    DepositAccountSerializer,
    DepositTransactionCreateSerializer,
    LeaseCreateSerializer,
    LeaseSerializer,
    RenewLeaseSerializer,
    TenantSerializer,
)

LEASING_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)
APPROVAL_ROLES = (OrganizationRole.OWNER, OrganizationRole.MANAGER)


class TenantViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = TenantSerializer
    queryset = Tenant.objects.all()
    filterset_fields = ["status"]
    search_fields = ["full_name", "phone", "email"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        return [require_org_roles(*LEASING_WRITE_ROLES)()]


class LeaseViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = (
        Lease.objects.select_related("unit", "unit__property", "deposit_account")
        .prefetch_related(
            "occupants__tenant",
            "events__actor_user",
            "deposit_account__transactions__recorded_by",
        )
        .all()
    )
    filterset_fields = ["status", "unit", "unit__property"]
    search_fields = ["unit__unit_code", "unit__property__name", "occupants__tenant__full_name"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        if self.action in ("amend_rent", "renew", "terminate"):
            return [require_org_roles(*APPROVAL_ROLES)()]
        return [require_org_roles(*LEASING_WRITE_ROLES)()]

    def get_serializer_class(self):
        if self.action == "create":
            return LeaseCreateSerializer
        return LeaseSerializer

    def create(self, request, *args, **kwargs):
        serializer = LeaseCreateSerializer(
            data=request.data,
            context={"organization": self.get_organization(), "actor": request.user},
        )
        serializer.is_valid(raise_exception=True)
        lease = serializer.save()
        return Response(
            LeaseSerializer(lease).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="amend-rent")
    @transaction.atomic
    def amend_rent(self, request, pk=None):
        lease = self.get_object()
        if lease.status != LeaseStatus.ACTIVE:
            raise ValidationError({"detail": "Only active leases can have rent amended."})

        serializer = AmendRentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_rent = lease.rent_amount
        new_rent = serializer.validated_data["rent_amount"]
        reason = serializer.validated_data["reason"]

        lease.rent_amount = new_rent
        lease.save(update_fields=["rent_amount", "updated_at"])

        LeaseEvent.objects.create(
            organization=lease.organization,
            lease=lease,
            event_type=LeaseEventType.RENT_AMENDED,
            actor_user=request.user,
            details={
                "old_rent": str(old_rent),
                "new_rent": str(new_rent),
                "reason": reason,
            },
        )
        record_audit_event(
            organization=lease.organization,
            actor_user=request.user,
            action="LEASE_RENT_AMENDED",
            entity_type="Lease",
            entity_id=lease.id,
            metadata={"old_rent": str(old_rent), "new_rent": str(new_rent)},
        )
        return Response(LeaseSerializer(lease).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def renew(self, request, pk=None):
        lease = self.get_object()
        if lease.status != LeaseStatus.ACTIVE:
            raise ValidationError({"detail": "Only active leases can be renewed."})

        serializer = RenewLeaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_end = serializer.validated_data["end_date"]
        if new_end < lease.start_date:
            raise ValidationError({"end_date": "End date cannot be earlier than start date."})

        old_end = lease.end_date.isoformat() if lease.end_date else None
        old_rent = lease.rent_amount
        lease.end_date = new_end
        if serializer.validated_data.get("rent_amount") is not None:
            lease.rent_amount = serializer.validated_data["rent_amount"]
        lease.save(update_fields=["end_date", "rent_amount", "updated_at"])

        LeaseEvent.objects.create(
            organization=lease.organization,
            lease=lease,
            event_type=LeaseEventType.RENEWED,
            actor_user=request.user,
            details={
                "old_end_date": old_end,
                "new_end_date": new_end.isoformat(),
                "old_rent": str(old_rent),
                "new_rent": str(lease.rent_amount),
            },
        )
        return Response(LeaseSerializer(lease).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def terminate(self, request, pk=None):
        lease = self.get_object()
        if lease.status != LeaseStatus.ACTIVE:
            raise ValidationError({"detail": "Only active leases can be terminated."})

        end_date = request.data.get("end_date")
        reason = request.data.get("reason", "")
        if end_date:
            from datetime import date

            parsed_end = date.fromisoformat(str(end_date))
            if parsed_end < lease.start_date:
                raise ValidationError({"end_date": "End date cannot be earlier than start date."})
            lease.end_date = parsed_end

        lease.status = LeaseStatus.TERMINATED
        lease.save(update_fields=["status", "end_date", "updated_at"])

        unit = lease.unit
        unit.status = UnitStatus.VACANT
        unit.save(update_fields=["status", "updated_at"])

        LeaseEvent.objects.create(
            organization=lease.organization,
            lease=lease,
            event_type=LeaseEventType.TERMINATED,
            actor_user=request.user,
            details={
                "end_date": lease.end_date.isoformat() if lease.end_date else None,
                "reason": reason,
            },
        )
        record_audit_event(
            organization=lease.organization,
            actor_user=request.user,
            action="LEASE_TERMINATED",
            entity_type="Lease",
            entity_id=lease.id,
            metadata={"unit_code": unit.unit_code, "reason": reason},
        )
        return Response(LeaseSerializer(lease).data)

    @action(detail=True, methods=["post"], url_path="deposit-transactions")
    @transaction.atomic
    def deposit_transactions(self, request, pk=None):
        lease = self.get_object()
        serializer = DepositTransactionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tx_type = serializer.validated_data["transaction_type"]
        amount = serializer.validated_data["amount"]

        if tx_type in (DepositTransactionType.DEDUCTED, DepositTransactionType.REFUNDED):
            if request.membership.role not in APPROVAL_ROLES:
                return Response(
                    {"detail": "Only OWNER or MANAGER can deduct or refund deposits."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        deposit_account, _ = DepositAccount.objects.select_for_update().get_or_create(
            organization=lease.organization,
            lease=lease,
        )
        held = deposit_account.held_balance()
        if tx_type != DepositTransactionType.RECEIVED and amount > held:
            raise ValidationError(
                {"amount": f"Cannot {tx_type.lower()} more than held balance ({held})."}
            )

        DepositTransaction.objects.create(
            organization=lease.organization,
            deposit_account=deposit_account,
            transaction_type=tx_type,
            amount=amount,
            reference=serializer.validated_data["reference"],
            notes=serializer.validated_data["notes"],
            recorded_by=request.user,
        )
        deposit_account.refresh_status()

        record_audit_event(
            organization=lease.organization,
            actor_user=request.user,
            action=f"DEPOSIT_{tx_type}",
            entity_type="DepositAccount",
            entity_id=deposit_account.id,
            metadata={"amount": str(amount), "lease_id": str(lease.id)},
        )
        return Response(
            DepositAccountSerializer(deposit_account).data,
            status=status.HTTP_201_CREATED,
        )
