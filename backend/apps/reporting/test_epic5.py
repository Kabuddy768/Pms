from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_expenses_maintenance_and_end_to_end_dashboard_reconciliation():
    owner = User.objects.create_user(email="own@kilimani.co.ke", password="Password123!")
    accountant = User.objects.create_user(email="acc@kilimani.co.ke", password="Password123!")
    caretaker = User.objects.create_user(email="care@kilimani.co.ke", password="Password123!")
    user_b = User.objects.create_user(email="b@other.co.ke", password="Password123!")

    org_a = Organization.objects.create(name="Kilimani Estates")
    org_b = Organization.objects.create(name="Other Estates")

    OrganizationMembership.objects.create(
        organization=org_a, user=owner, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org_a, user=accountant, role=OrganizationRole.ACCOUNTANT
    )
    OrganizationMembership.objects.create(
        organization=org_a, user=caretaker, role=OrganizationRole.CARETAKER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=user_b, role=OrganizationRole.OWNER
    )

    own_c = client_for(owner, org_a.id)
    acc_c = client_for(accountant, org_a.id)
    care_c = client_for(caretaker, org_a.id)
    b_c = client_for(user_b, org_b.id)

    # 1. Create Property and 2 Units
    prop = own_c.post("/api/v1/properties/", {"name": "Kilimani Heights"}, format="json").json()
    u1 = own_c.post(
        "/api/v1/units/",
        {"property": prop["id"], "unit_code": "A1", "advertised_rent": "45000.00"},
        format="json",
    ).json()
    own_c.post(
        "/api/v1/units/",
        {"property": prop["id"], "unit_code": "A2", "advertised_rent": "35000.00"},
        format="json",
    )

    # 2. Register Tenant and Create Lease on Unit A1 (expiring in 30 days)
    tenant = own_c.post(
        "/api/v1/tenants/",
        {"full_name": "Grace Muthoni", "phone": "+254712345678"},
        format="json",
    ).json()
    expiry = (timezone.localdate() + timedelta(days=30)).isoformat()
    lease = own_c.post(
        "/api/v1/leases/",
        {
            "unit": u1["id"],
            "start_date": "2026-01-01",
            "end_date": expiry,
            "rent_amount": "45000.00",
            "occupants": [{"tenant": tenant["id"], "occupant_role": "PRIMARY"}],
        },
        format="json",
    )
    assert lease.status_code == 201
    lease_id = lease.json()["id"]

    # 3. Generate Rent Invoice
    inv_res = acc_c.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-11"},
        format="json",
    )
    assert inv_res.status_code == 201

    # 4. Record Partial Payment (30,000) + Unmatched Suspense Payment (5,000)
    pay = acc_c.post(
        "/api/v1/payments/",
        {
            "lease": lease_id,
            "payment_reference": "SJK89123XY",
            "method": "MPESA_PAYBILL",
            "amount": "30000.00",
        },
        format="json",
    )
    assert pay.status_code == 201
    assert pay.json()["receipt_number"].startswith("RCPT-")

    acc_c.post(
        "/api/v1/payments/mpesa-callback/",
        {
            "trans_id": "SUSP001",
            "trans_amount": "5000.00",
            "bill_ref_number": "UNKNOWN",
            "msisdn": "254799000111",
        },
        format="json",
    )

    # 5. Expense Category + Expense (Accountant records, Owner approves)
    cat = acc_c.post(
        "/api/v1/expense-categories/", {"name": "Plumbing"}, format="json"
    ).json()
    exp = acc_c.post(
        "/api/v1/expenses/",
        {
            "property": prop["id"],
            "unit": u1["id"],
            "category": cat["id"],
            "description": "Pipe replacement",
            "amount": "8000.00",
            "expense_date": "2026-11-10",
        },
        format="json",
    )
    assert exp.status_code == 201
    exp_id = exp.json()["id"]

    assert acc_c.post(f"/api/v1/expenses/{exp_id}/approve/").status_code == 403
    assert own_c.post(f"/api/v1/expenses/{exp_id}/approve/").status_code == 200

    # 6. Caretaker creates and resolves Maintenance Request
    maint = care_c.post(
        "/api/v1/maintenance-requests/",
        {
            "property": prop["id"],
            "unit": u1["id"],
            "title": "Leaking kitchen tap",
            "priority": "HIGH",
        },
        format="json",
    )
    assert maint.status_code == 201
    maint_id = maint.json()["id"]
    upd = care_c.patch(
        f"/api/v1/maintenance-requests/{maint_id}/",
        {"status": "IN_PROGRESS"},
        format="json",
    )
    assert upd.status_code == 200
    assert upd.json()["status"] == "IN_PROGRESS"

    # 7. Dashboard Reconciliation
    dash = own_c.get("/api/v1/reports/dashboard/").json()
    assert dash["total_units"] == 2
    assert dash["occupied_units"] == 1
    assert dash["vacant_units"] == 1
    assert dash["occupancy_rate"] == "50.00"
    assert dash["total_billed"] == "45000.00"
    assert dash["total_collected"] == "35000.00"
    assert dash["total_arrears"] == "15000.00"
    assert dash["total_expenses"] == "8000.00"
    assert dash["net_cashflow"] == "27000.00"
    assert dash["unmatched_suspense_count"] == 1
    assert dash["open_maintenance_count"] == 1
    assert len(dash["upcoming_lease_expiries"]) == 1
    assert Decimal(dash["arrears_by_lease"][0]["outstanding_balance"]) == Decimal("15000.00")

    # 8. Cross-Tenant Isolation Check (Org B cannot see Org A data)
    assert b_c.get(f"/api/v1/expenses/{exp_id}/").status_code == 404
    assert b_c.get(f"/api/v1/maintenance-requests/{maint_id}/").status_code == 404
    b_dash = b_c.get("/api/v1/reports/dashboard/").json()
    assert b_dash["total_units"] == 0
    assert b_dash["total_billed"] == "0.00"
