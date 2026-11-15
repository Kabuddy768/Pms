from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.leasing.models import Lease, LeaseStatus
from apps.organizations.models import OrganizationRole
from apps.payments.models import Payment, PaymentStatus
from apps.payments.services import allocate_payment_fifo

from .models import (
    AdjustmentType,
    ChargeType,
    Invoice,
    InvoiceAdjustment,
    InvoiceLine,
    InvoiceStatus,
    SequenceType,
    next_sequence_number,
)
from .serializers import (
    GenerateMonthlyInvoicesSerializer,
    InvoiceAdjustmentCreateSerializer,
    InvoiceCreateSerializer,
    InvoiceSerializer,
)

BILLING_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)
APPROVAL_ROLES = (OrganizationRole.OWNER, OrganizationRole.MANAGER)


class InvoiceViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = (
        Invoice.objects.select_related("lease", "lease__unit", "lease__unit__property")
        .prefetch_related(
            "lease__occupants__tenant",
            "lines",
            "adjustments__approved_by",
            "allocations",
        )
        .all()
    )
    filterset_fields = ["status", "billing_period", "lease"]
    search_fields = [
        "invoice_number",
        "lease__unit__unit_code",
        "lease__occupants__tenant__full_name",
    ]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        if self.action == "adjustments":
            return [require_org_roles(*APPROVAL_ROLES)()]
        return [require_org_roles(*BILLING_WRITE_ROLES)()]

    def get_serializer_class(self):
        if self.action == "create":
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def create(self, request, *args, **kwargs):
        serializer = InvoiceCreateSerializer(
            data=request.data,
            context={"organization": self.get_organization(), "actor": request.user},
        )
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()

        # Apply any existing unallocated credit on the lease
        for p in Payment.objects.filter(
            organization=invoice.organization,
            lease=invoice.lease,
            status=PaymentStatus.CONFIRMED,
        ).order_by("received_at"):
            if p.unallocated_amount() > Decimal("0.00"):
                allocate_payment_fifo(payment=p)

        invoice.refresh_from_db()
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="generate-monthly")
    @transaction.atomic
    def generate_monthly(self, request):
        org = self.get_organization()
        serializer = GenerateMonthlyInvoicesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period = serializer.validated_data["billing_period"]
        year, month = (int(x) for x in period.split("-"))

        active_leases = Lease.objects.select_related("unit").filter(
            organization=org, status=LeaseStatus.ACTIVE
        )

        created_invoices = []
        skipped_count = 0
        for lease in active_leases:
            if Invoice.objects.filter(
                organization=org, lease=lease, billing_period=period
            ).exists():
                skipped_count += 1
                continue

            issue_dt = date(year, month, 1)
            due_dt = date(year, month, min(lease.billing_day, 28))
            inv_number = next_sequence_number(
                organization=org,
                sequence_type=SequenceType.INVOICE,
                year=year,
            )
            inv = Invoice.objects.create(
                organization=org,
                lease=lease,
                invoice_number=inv_number,
                billing_period=period,
                issue_date=issue_dt,
                due_date=due_dt,
                currency=org.default_currency,
                total_amount=lease.rent_amount,
                status=InvoiceStatus.ISSUED,
            )
            InvoiceLine.objects.create(
                organization=org,
                invoice=inv,
                charge_type=ChargeType.RENT,
                description=f"Monthly Rent ({period}) - Unit {lease.unit.unit_code}",
                quantity=Decimal("1.00"),
                unit_amount=lease.rent_amount,
                line_total=lease.rent_amount,
            )

            for p in Payment.objects.filter(
                organization=org, lease=lease, status=PaymentStatus.CONFIRMED
            ).order_by("received_at"):
                if p.unallocated_amount() > Decimal("0.00"):
                    allocate_payment_fifo(payment=p)

            inv.refresh_from_db()
            created_invoices.append(inv)

        record_audit_event(
            organization=org,
            actor_user=request.user,
            action="MONTHLY_INVOICES_GENERATED",
            entity_type="Organization",
            entity_id=org.id,
            metadata={
                "billing_period": period,
                "created_count": len(created_invoices),
                "skipped_count": skipped_count,
            },
        )
        return Response(
            {
                "billing_period": period,
                "created_count": len(created_invoices),
                "skipped_count": skipped_count,
                "invoices": InvoiceSerializer(created_invoices, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def adjustments(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status == InvoiceStatus.VOID:
            raise ValidationError({"detail": "Cannot adjust a void invoice."})

        serializer = InvoiceAdjustmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        adj_type = serializer.validated_data["adjustment_type"]
        amount = serializer.validated_data["amount"]
        reason = serializer.validated_data["reason"]

        if adj_type == AdjustmentType.CREDIT and amount > invoice.outstanding_balance():
            outstanding = invoice.outstanding_balance()
            raise ValidationError(
                {"amount": f"Credit cannot exceed outstanding balance ({outstanding})."}
            )

        InvoiceAdjustment.objects.create(
            organization=invoice.organization,
            invoice=invoice,
            adjustment_type=adj_type,
            amount=amount,
            reason=reason,
            approved_by=request.user,
        )
        invoice = self.get_queryset().get(id=invoice.id)
        invoice.refresh_status()
        record_audit_event(
            organization=invoice.organization,
            actor_user=request.user,
            action=f"INVOICE_{adj_type}_ISSUED",
            entity_type="Invoice",
            entity_id=invoice.id,
            metadata={
                "invoice_number": invoice.invoice_number,
                "amount": str(amount),
                "reason": reason,
            },
        )
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)
