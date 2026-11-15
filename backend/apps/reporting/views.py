from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Invoice, InvoiceStatus
from apps.core.tenancy import HasOrganizationMembership
from apps.expenses.models import Expense, ExpenseStatus
from apps.leasing.models import Lease, LeaseStatus
from apps.maintenance.models import MaintenanceRequest, MaintenanceStatus
from apps.payments.models import Payment, PaymentStatus
from apps.properties.models import Unit, UnitStatus


class DashboardSummaryView(APIView):
    """Tenant-scoped financial & operational KPI summary reconciled to source records."""

    permission_classes = [HasOrganizationMembership]

    def get(self, request):
        org = request.organization
        today = timezone.localdate()

        units = Unit.objects.filter(organization=org).exclude(status=UnitStatus.ARCHIVED)
        total_units = units.count()
        occupied_units = units.filter(status=UnitStatus.OCCUPIED).count()
        vacant_units = units.filter(status=UnitStatus.VACANT).count()
        occupancy_rate = (
            (Decimal(occupied_units) * Decimal("100.00") / Decimal(total_units)).quantize(
                Decimal("0.01")
            )
            if total_units > 0
            else Decimal("0.00")
        )

        invoices = (
            Invoice.objects.select_related("lease__unit", "lease__unit__property")
            .prefetch_related("lease__occupants__tenant", "adjustments", "allocations")
            .filter(organization=org)
            .exclude(status=InvoiceStatus.VOID)
        )
        total_billed = Decimal("0.00")
        total_arrears = Decimal("0.00")
        arrears_by_lease_map: dict[str, dict] = {}

        for inv in invoices:
            total_billed += inv.adjusted_total()
            outstanding = inv.outstanding_balance()
            if outstanding > Decimal("0.00"):
                total_arrears += outstanding
                lease_key = str(inv.lease_id)
                if lease_key not in arrears_by_lease_map:
                    occ = inv.lease.occupants.first()
                    arrears_by_lease_map[lease_key] = {
                        "lease_id": lease_key,
                        "unit_code": inv.lease.unit.unit_code,
                        "property_name": inv.lease.unit.property.name,
                        "tenant_name": occ.tenant.full_name if occ else "—",
                        "outstanding_balance": Decimal("0.00"),
                    }
                arrears_by_lease_map[lease_key]["outstanding_balance"] += outstanding

        arrears_by_lease = sorted(
            [
                {
                    **item,
                    "outstanding_balance": f"{item['outstanding_balance']:.2f}",
                }
                for item in arrears_by_lease_map.values()
            ],
            key=lambda x: Decimal(x["outstanding_balance"]),
            reverse=True,
        )[:10]

        confirmed_payments = Payment.objects.filter(
            organization=org, status=PaymentStatus.CONFIRMED
        )
        total_collected = Decimal("0.00")
        unmatched_count = 0
        unmatched_amount = Decimal("0.00")
        for p in confirmed_payments:
            total_collected += p.amount
            if p.lease_id is None:
                unmatched_count += 1
                unmatched_amount += p.amount

        expenses = Expense.objects.filter(organization=org).exclude(status=ExpenseStatus.VOID)
        total_expenses = sum((exp.amount for exp in expenses), Decimal("0.00"))
        net_cashflow = total_collected - total_expenses

        expiry_horizon = today + timedelta(days=60)
        expiring_leases = (
            Lease.objects.select_related("unit", "unit__property")
            .prefetch_related("occupants__tenant")
            .filter(
                organization=org,
                status=LeaseStatus.ACTIVE,
                end_date__isnull=False,
                end_date__gte=today,
                end_date__lte=expiry_horizon,
            )
            .order_by("end_date")[:10]
        )
        upcoming_expiries = [
            {
                "lease_id": str(lease.id),
                "unit_code": lease.unit.unit_code,
                "property_name": lease.unit.property.name,
                "tenant_name": lease.occupants.first().tenant.full_name
                if lease.occupants.first()
                else "—",
                "end_date": lease.end_date.isoformat(),
                "rent_amount": f"{lease.rent_amount:.2f}",
            }
            for lease in expiring_leases
        ]

        open_maintenance = MaintenanceRequest.objects.filter(
            organization=org,
            status__in=[MaintenanceStatus.OPEN, MaintenanceStatus.IN_PROGRESS],
        ).count()

        return Response(
            {
                "currency": org.default_currency,
                "total_units": total_units,
                "occupied_units": occupied_units,
                "vacant_units": vacant_units,
                "occupancy_rate": f"{occupancy_rate:.2f}",
                "total_billed": f"{total_billed:.2f}",
                "total_collected": f"{total_collected:.2f}",
                "total_arrears": f"{total_arrears:.2f}",
                "total_expenses": f"{total_expenses:.2f}",
                "net_cashflow": f"{net_cashflow:.2f}",
                "unmatched_suspense_count": unmatched_count,
                "unmatched_suspense_amount": f"{unmatched_amount:.2f}",
                "open_maintenance_count": open_maintenance,
                "arrears_by_lease": arrears_by_lease,
                "upcoming_lease_expiries": upcoming_expiries,
            }
        )
