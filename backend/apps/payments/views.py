import hmac

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.audit.models import record_audit_event
from apps.billing.models import Invoice
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.leasing.models import Lease
from apps.organizations.models import OrganizationRole

from .models import (
    Payment,
    PaymentMethod,
    PaymentStatus,
    ProviderTransaction,
)
from .serializers import (
    AllocatePaymentSerializer,
    AssignPaymentSerializer,
    MpesaCallbackSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    ReversePaymentSerializer,
)
from .services import (
    allocate_payment_fifo,
    allocate_payment_to_invoice,
    ensure_receipt_number,
    match_lease_for_callback,
    reverse_payment,
)

PAYMENT_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)
APPROVAL_ROLES = (OrganizationRole.OWNER, OrganizationRole.MANAGER)


class PaymentViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = (
        Payment.objects.select_related("lease", "lease__unit", "lease__unit__property", "tenant")
        .prefetch_related("allocations__invoice", "reversals__reversed_by")
        .all()
    )
    filterset_fields = ["status", "method", "lease"]
    search_fields = [
        "payment_reference",
        "receipt_number",
        "payer_name",
        "payer_phone",
        "raw_account_ref",
    ]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        if self.action == "reverse":
            return [require_org_roles(*APPROVAL_ROLES)()]
        return [require_org_roles(*PAYMENT_WRITE_ROLES)()]

    def get_queryset(self):
        qs = super().get_queryset()
        unmatched = self.request.query_params.get("unmatched")
        if unmatched == "true":
            qs = qs.filter(lease__isnull=True, status=PaymentStatus.CONFIRMED)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return PaymentCreateSerializer
        return PaymentSerializer

    def create(self, request, *args, **kwargs):
        serializer = PaymentCreateSerializer(
            data=request.data,
            context={"organization": self.get_organization(), "actor": request.user},
        )
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="mpesa-callback")
    @transaction.atomic
    def mpesa_callback(self, request):
        """Idempotent M-Pesa C2B callback processor with Kenyan auto-match + Suspense queue."""
        expected_secret = getattr(settings, "MPESA_CALLBACK_SECRET", "")
        if expected_secret:
            provided = request.headers.get("X-Mpesa-Callback-Secret", "")
            if not provided or not hmac.compare_digest(provided, expected_secret):
                raise PermissionDenied("Invalid M-Pesa callback signature.")

        org = self.get_organization()
        serializer = MpesaCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        trans_id = data["trans_id"].strip().upper()

        existing_tx = ProviderTransaction.objects.filter(
            organization=org,
            provider="MPESA",
            provider_reference=trans_id,
        ).first()
        if existing_tx:
            return Response(
                {
                    "duplicate": True,
                    "processing_status": existing_tx.processing_status,
                    "payment": PaymentSerializer(existing_tx.payment).data
                    if existing_tx.payment
                    else None,
                },
                status=status.HTTP_200_OK,
            )

        matched_lease = match_lease_for_callback(
            organization=org,
            raw_account_ref=data["bill_ref_number"],
            payer_phone=data["msisdn"],
        )
        tenant = None
        if matched_lease:
            occ = matched_lease.occupants.first()
            tenant = occ.tenant if occ else None

        payment = Payment.objects.create(
            organization=org,
            lease=matched_lease,
            tenant=tenant,
            payment_reference=trans_id,
            method=PaymentMethod.MPESA_PAYBILL,
            currency=org.default_currency,
            amount=data["trans_amount"],
            received_at=timezone.now(),
            status=PaymentStatus.CONFIRMED,
            payer_name=data["first_name"],
            payer_phone=data["msisdn"],
            raw_account_ref=data["bill_ref_number"],
        )
        ensure_receipt_number(payment)

        if matched_lease:
            allocate_payment_fifo(payment=payment)
            proc_status = "MATCHED"
        else:
            proc_status = "UNMATCHED"

        ProviderTransaction.objects.create(
            organization=org,
            payment=payment,
            provider="MPESA",
            provider_reference=trans_id,
            processing_status=proc_status,
            safe_payload={
                "trans_id": trans_id,
                "trans_amount": str(data["trans_amount"]),
                "bill_ref_number": data["bill_ref_number"],
                "msisdn": data["msisdn"],
                "first_name": data["first_name"],
            },
        )
        record_audit_event(
            organization=org,
            actor_user=request.user,
            action="MPESA_CALLBACK_PROCESSED",
            entity_type="Payment",
            entity_id=payment.id,
            metadata={"trans_id": trans_id, "processing_status": proc_status},
        )
        return Response(
            {
                "duplicate": False,
                "processing_status": proc_status,
                "payment": PaymentSerializer(payment).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def assign(self, request, pk=None):
        """Assign an unmatched Suspense payment to a lease and optionally run FIFO."""
        payment = self.get_object()
        if payment.status != PaymentStatus.CONFIRMED:
            raise ValidationError({"detail": "Only confirmed payments can be assigned."})

        serializer = AssignPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lease = Lease.objects.filter(
            organization=payment.organization, id=serializer.validated_data["lease"]
        ).first()
        if not lease:
            raise ValidationError({"lease": "Lease does not belong to your organization."})

        occ = lease.occupants.first()
        payment.lease = lease
        payment.tenant = occ.tenant if occ else None
        payment.save(update_fields=["lease", "tenant", "updated_at"])

        if serializer.validated_data["auto_allocate"]:
            allocate_payment_fifo(payment=payment)

        record_audit_event(
            organization=payment.organization,
            actor_user=request.user,
            action="PAYMENT_ASSIGNED_FROM_SUSPENSE",
            entity_type="Payment",
            entity_id=payment.id,
            metadata={"lease_id": str(lease.id), "unit_code": lease.unit.unit_code},
        )
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"])
    def allocate(self, request, pk=None):
        payment = self.get_object()
        serializer = AllocatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = Invoice.objects.filter(
            organization=payment.organization, id=serializer.validated_data["invoice"]
        ).first()
        if not invoice:
            raise ValidationError({"invoice": "Invoice does not belong to your organization."})

        allocate_payment_to_invoice(
            payment=payment,
            invoice=invoice,
            amount=serializer.validated_data["amount"],
        )
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        serializer = ReversePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reverse_payment(
            payment=payment,
            reason=serializer.validated_data["reason"],
            actor_user=request.user,
        )
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)
