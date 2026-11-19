from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.models import record_audit_event
from apps.core.tenancy import HasOrganizationMembership, TenantScopedMixin, require_org_roles
from apps.organizations.models import OrganizationRole

from .models import Expense, ExpenseCategory, ExpenseStatus
from .serializers import ExpenseCategorySerializer, ExpenseSerializer

EXPENSE_WRITE_ROLES = (
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.ACCOUNTANT,
)
APPROVAL_ROLES = (OrganizationRole.OWNER, OrganizationRole.MANAGER)


class ExpenseCategoryViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    queryset = ExpenseCategory.objects.all()
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        return [require_org_roles(*EXPENSE_WRITE_ROLES)()]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx


class ExpenseViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    queryset = Expense.objects.select_related(
        "property", "unit", "category", "recorded_by", "approved_by"
    ).all()
    filterset_fields = ["status", "property", "category"]
    search_fields = ["description", "property__name", "category__name"]
    ordering_fields = ["expense_date", "amount", "status", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [HasOrganizationMembership()]
        if self.action in ("approve", "void"):
            return [require_org_roles(*APPROVAL_ROLES)()]
        return [require_org_roles(*EXPENSE_WRITE_ROLES)()]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx

    def perform_create(self, serializer):
        org = self.get_organization()
        expense = serializer.save(
            organization=org,
            currency=org.default_currency,
            recorded_by=self.request.user,
        )
        record_audit_event(
            organization=org,
            actor_user=self.request.user,
            action="EXPENSE_RECORDED",
            entity_type="Expense",
            entity_id=expense.id,
            metadata={"amount": str(expense.amount), "category": expense.category.name},
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        expense = self.get_object()
        if expense.status == ExpenseStatus.VOID:
            raise ValidationError({"detail": "Cannot approve a void expense."})
        expense.status = ExpenseStatus.APPROVED
        expense.approved_by = request.user
        expense.save(update_fields=["status", "approved_by", "updated_at"])
        record_audit_event(
            organization=expense.organization,
            actor_user=request.user,
            action="EXPENSE_APPROVED",
            entity_type="Expense",
            entity_id=expense.id,
            metadata={"amount": str(expense.amount)},
        )
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        expense = self.get_object()
        expense.status = ExpenseStatus.VOID
        expense.save(update_fields=["status", "updated_at"])
        record_audit_event(
            organization=expense.organization,
            actor_user=request.user,
            action="EXPENSE_VOIDED",
            entity_type="Expense",
            entity_id=expense.id,
            metadata={"amount": str(expense.amount)},
        )
        return Response(ExpenseSerializer(expense).data)
