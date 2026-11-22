from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_meter_readings_auto_billed_and_owner_statement_and_kra_mri_reconcile():
    owner_a = User.objects.create_user(email="own@a.co.ke", password="Password123!")
    caretaker_a = User.objects.create_user(email="care@a.co.ke", password="Password123!")
    mgr_b = User.objects.create_user(email="mgr@b.co.ke", password="Password123!")

    org_a = Organization.objects.create(name="Kileleshwa Homes", kra_pin="P051234567A")
    org_b = Organization.objects.create(name="Other Homes")
    OrganizationMembership.objects.create(
        organization=org_a, user=owner_a, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org_a, user=caretaker_a, role=OrganizationRole.CARETAKER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=mgr_b, role=OrganizationRole.MANAGER
    )

    c_own = client_for(owner_a, org_a.id)
    c_care = client_for(caretaker_a, org_a.id)
    c_b_own = client_for(mgr_b, org_b.id)
    c_b_forged = client_for(mgr_b, org_a.id)

    prop = c_own.post(
        "/api/v1/properties/",
        {
            "name": "Kileleshwa Court",
            "property_type": "RESIDENTIAL",
            "management_fee_percent": "10.00",
        },
        format="json",
    ).data
    unit = c_own.post(
        "/api/v1/units/",
        {
            "property": prop["id"],
            "unit_code": "KC-1",
            "unit_type": "2BR",
            "advertised_rent": "40000.00",
        },
        format="json",
    ).data

    # Owners totaling 100% (60% + 40%)
    o1 = c_own.post(
        "/api/v1/owners/",
        {"full_name": "James Kariuki", "kra_pin": "A00111222B"},
        format="json",
    ).data
    o2 = c_own.post(
        "/api/v1/owners/",
        {"full_name": "Mary Wanjiru", "kra_pin": "A00333444C"},
        format="json",
    ).data
    c_own.post(
        f"/api/v1/properties/{prop['id']}/owners/",
        {
            "owners": [
                {"owner": o1["id"], "ownership_share": "60.00", "valid_from": "2026-01-01"},
                {"owner": o2["id"], "ownership_share": "40.00", "valid_from": "2026-01-01"},
            ]
        },
        format="json",
    )

    tenant = c_own.post(
        "/api/v1/tenants/",
        {"full_name": "Samuel Kiprop", "phone": "+254712345678", "kra_pin": "A00999888D"},
        format="json",
    ).data
    lease = c_own.post(
        "/api/v1/leases/",
        {
            "unit": unit["id"],
            "start_date": "2026-10-01",
            "rent_amount": "40000.00",
            "billing_frequency": "MONTHLY",
            "billing_day": 5,
            "required_deposit": "40000.00",
            "occupants": [{"tenant": tenant["id"], "occupant_role": "PRIMARY"}],
        },
        format="json",
    ).data

    # Caretaker submits water meter reading: 120 -> 130 (10 units @ 150 = 1500.00)
    meter_res = c_care.post(
        "/api/v1/meter-readings/",
        {
            "unit": unit["id"],
            "charge_type": "WATER",
            "billing_period": "2026-10",
            "previous_reading": "120.00",
            "current_reading": "130.00",
            "unit_rate": "150.00",
        },
        format="json",
    )
    assert meter_res.status_code == 201
    assert meter_res.data["total_amount"] == "1500.00"
    assert meter_res.data["units_consumed"] == "10.00"

    # Generate monthly invoice -> Rent 40,000 + Water 1,500 = 41,500.00
    gen_res = c_own.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-10"},
        format="json",
    )
    assert gen_res.status_code == 201
    inv = gen_res.data["invoices"][0]
    assert inv["total_amount"] == "41500.00"
    assert len(inv["lines"]) == 2

    # Editing a billed meter reading is rejected
    patch_billed = c_care.patch(
        f"/api/v1/meter-readings/{meter_res.data['id']}/",
        {"current_reading": "140.00"},
        format="json",
    )
    assert patch_billed.status_code == 400

    # Tenant pays 41,500.00 in full
    pay_res = c_own.post(
        "/api/v1/payments/",
        {
            "lease": lease["id"],
            "payment_reference": "MPESA-SLICE11-01",
            "method": "MPESA_PAYBILL",
            "amount": "41500.00",
            "auto_allocate": True,
        },
        format="json",
    )
    assert pay_res.status_code == 201

    # Approved expense of 5,000.00 + unapproved expense of 2,000.00 (ignored in remittance)
    cat = c_own.post(
        "/api/v1/expense-categories/", {"name": "Repairs"}, format="json"
    ).data
    exp1 = c_own.post(
        "/api/v1/expenses/",
        {
            "property": prop["id"],
            "category": cat["id"],
            "description": "Gate motor service",
            "amount": "5000.00",
            "expense_date": "2026-10-12",
        },
        format="json",
    ).data
    c_own.post(f"/api/v1/expenses/{exp1['id']}/approve/", {}, format="json")
    c_own.post(
        "/api/v1/expenses/",
        {
            "property": prop["id"],
            "category": cat["id"],
            "description": "Unapproved pending quote",
            "amount": "2000.00",
            "expense_date": "2026-10-15",
        },
        format="json",
    )

    # Owner statement: Gross 41,500 - 10% fee (4,150) - Approved Exp (5,000) = 32,350.00
    # Split 60% = 19,410.00, 40% = 12,940.00
    stmt_res = c_own.get("/api/v1/reports/owner-statements/?billing_period=2026-10")
    assert stmt_res.status_code == 200
    stmt = stmt_res.data["statements"][0]
    assert stmt["gross_collected"] == "41500.00"
    assert stmt["management_fee_amount"] == "4150.00"
    assert stmt["approved_expenses"] == "5000.00"
    assert stmt["net_remittance"] == "32350.00"
    payouts = {o["full_name"]: Decimal(o["payout_amount"]) for o in stmt["owners"]}
    assert payouts["James Kariuki"] == Decimal("19410.00")
    assert payouts["Mary Wanjiru"] == Decimal("12940.00")

    # KRA 7.5% MRI summary: 41,500 * 0.075 = 3,112.50
    mri_res = c_own.get("/api/v1/reports/kra-mri-summary/?billing_period=2026-10")
    assert mri_res.status_code == 200
    assert mri_res.data["organization_kra_pin"] == "P051234567A"
    assert mri_res.data["gross_residential_collected"] == "41500.00"
    assert mri_res.data["estimated_mri_tax"] == "3112.50"

    # Cross-tenant negative checks
    assert c_b_forged.get("/api/v1/reports/owner-statements/").status_code == 403
    assert c_b_forged.get("/api/v1/reports/kra-mri-summary/").status_code == 403
    assert c_b_own.get("/api/v1/meter-readings/").data["count"] == 0
    assert c_b_own.get("/api/v1/reports/owner-statements/").data["statements"] == []
