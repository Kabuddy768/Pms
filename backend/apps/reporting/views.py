import re
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Invoice, InvoiceStatus
from apps.core.tenancy import HasOrganizationMembership
from apps.expenses.models import Expense, ExpenseStatus
from apps.leasing.models import Lease, LeaseStatus
from apps.maintenance.models import MaintenanceRequest, MaintenanceStatus
from apps.payments.models import AllocationStatus, Payment, PaymentAllocation, PaymentStatus
from apps.properties.models import Property, PropertyOwner, PropertyType, Unit, UnitStatus


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


def _parse_billing_period(raw: str | None) -> tuple[str, int, int]:
    period = (raw or timezone.localdate().strftime("%Y-%m")).strip()
    if not re.match(r"^\d{4}-\d{2}$", period):
        raise ValidationError({"billing_period": "Must use YYYY-MM format."})
    year_s, month_s = period.split("-")
    month = int(month_s)
    if month < 1 or month > 12:
        raise ValidationError({"billing_period": "Invalid month in billing_period."})
    return period, int(year_s), month


def _period_allocations(org, year: int, month: int, period: str):
    return PaymentAllocation.objects.select_related(
        "invoice__lease__unit__property"
    ).filter(
        organization=org,
        status=AllocationStatus.ACTIVE,
        payment__status=PaymentStatus.CONFIRMED,
    ).exclude(invoice__status=InvoiceStatus.VOID).filter(
        Q(invoice__billing_period=period)
        | Q(
            invoice__billing_period="",
            invoice__issue_date__year=year,
            invoice__issue_date__month=month,
        )
    )


class OwnerStatementView(APIView):
    """Monthly property owner payout statement reconciling rent, fees, expenses & equity splits."""

    permission_classes = [HasOrganizationMembership]

    def get(self, request):
        org = request.organization
        period, year, month = _parse_billing_period(
            request.query_params.get("billing_period")
        )
        property_id = request.query_params.get("property")

        props_qs = Property.objects.filter(organization=org).order_by("name")
        if property_id:
            props_qs = props_qs.filter(id=property_id)

        allocations = list(_period_allocations(org, year, month, period))
        expenses = list(
            Expense.objects.filter(
                organization=org,
                status=ExpenseStatus.APPROVED,
                expense_date__year=year,
                expense_date__month=month,
            )
        )

        statements = []
        for prop in props_qs:
            gross_collected = sum(
                (
                    a.amount
                    for a in allocations
                    if a.invoice.lease.unit.property_id == prop.id
                ),
                Decimal("0.00"),
            )
            fee_pct = prop.management_fee_percent
            fee_amount = (gross_collected * fee_pct / Decimal("100.00")).quantize(
                Decimal("0.01")
            )
            approved_expenses = sum(
                (exp.amount for exp in expenses if exp.property_id == prop.id),
                Decimal("0.00"),
            )
            net_remittance = gross_collected - fee_amount - approved_expenses

            owner_links = PropertyOwner.objects.select_related("owner").filter(
                organization=org,
                property=prop,
                valid_to__isnull=True,
            )
            owners_data = []
            for link in owner_links:
                payout = (
                    net_remittance * link.ownership_share / Decimal("100.00")
                ).quantize(Decimal("0.01"))
                owners_data.append(
                    {
                        "owner_id": str(link.owner_id),
                        "full_name": link.owner.full_name,
                        "kra_pin": link.owner.kra_pin,
                        "ownership_share": f"{link.ownership_share:.2f}",
                        "payout_amount": f"{payout:.2f}",
                    }
                )

            statements.append(
                {
                    "property_id": str(prop.id),
                    "property_name": prop.name,
                    "property_type": prop.property_type,
                    "gross_collected": f"{gross_collected:.2f}",
                    "management_fee_percent": f"{fee_pct:.2f}",
                    "management_fee_amount": f"{fee_amount:.2f}",
                    "approved_expenses": f"{approved_expenses:.2f}",
                    "net_remittance": f"{net_remittance:.2f}",
                    "owners": owners_data,
                }
            )

        return Response(
            {
                "billing_period": period,
                "currency": org.default_currency,
                "organization_name": org.name,
                "organization_kra_pin": org.kra_pin,
                "statements": statements,
            }
        )


class KraMriSummaryView(APIView):
    """Kenya 7.5% Monthly Rental Income (MRI) tax readiness summary."""

    permission_classes = [HasOrganizationMembership]

    def get(self, request):
        org = request.organization
        period, year, month = _parse_billing_period(
            request.query_params.get("billing_period")
        )
        allocations = list(_period_allocations(org, year, month, period))
        props = list(Property.objects.filter(organization=org).order_by("name"))

        gross_res = Decimal("0.00")
        gross_other = Decimal("0.00")
        breakdown = []

        for prop in props:
            collected = sum(
                (
                    a.amount
                    for a in allocations
                    if a.invoice.lease.unit.property_id == prop.id
                ),
                Decimal("0.00"),
            )
            is_residential = prop.property_type == PropertyType.RESIDENTIAL
            if is_residential:
                gross_res += collected
                prop_mri = (collected * Decimal("0.075")).quantize(Decimal("0.01"))
            else:
                gross_other += collected
                prop_mri = Decimal("0.00")

            breakdown.append(
                {
                    "property_id": str(prop.id),
                    "property_name": prop.name,
                    "property_type": prop.property_type,
                    "collected_amount": f"{collected:.2f}",
                    "mri_eligible": is_residential,
                    "estimated_mri_tax": f"{prop_mri:.2f}",
                }
            )

        estimated_total_mri = (gross_res * Decimal("0.075")).quantize(Decimal("0.01"))

        return Response(
            {
                "billing_period": period,
                "currency": org.default_currency,
                "organization_name": org.name,
                "organization_kra_pin": org.kra_pin,
                "mri_tax_rate": "7.50",
                "gross_residential_collected": f"{gross_res:.2f}",
                "gross_commercial_or_mixed_collected": f"{gross_other:.2f}",
                "estimated_mri_tax": f"{estimated_total_mri:.2f}",
                "properties": breakdown,
            }
        )
