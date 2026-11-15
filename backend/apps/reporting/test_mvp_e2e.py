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
def test_health_check_reports_database_ok():
    anon = APIClient()
    res = anon.get("/api/v1/health/")
    assert res.status_code == 200
    assert res.data == {"status": "ok", "service": "pms-backend", "database": "ok"}


@pytest.mark.django_db
def test_mpesa_callback_secret_enforced_when_configured(settings):
    settings.MPESA_CALLBACK_SECRET = "super-secret-callback-key"

    user = User.objects.create_user(email="mgr@sec.co.ke", password="Password123!")
    org = Organization.objects.create(name="Secret Org")
    OrganizationMembership.objects.create(
        organization=org, user=user, role=OrganizationRole.MANAGER
    )
    mgr = client_for(user, org.id)

    payload = {
        "trans_id": "MPESA-SEC-001",
        "trans_amount": "15000.00",
        "bill_ref_number": "A1",
        "msisdn": "254712345678",
        "first_name": "Amina",
    }

    missing = mgr.post("/api/v1/payments/mpesa-callback/", payload, format="json")
    assert missing.status_code == 403

    wrong = mgr.post(
        "/api/v1/payments/mpesa-callback/",
        payload,
        format="json",
        HTTP_X_MPESA_CALLBACK_SECRET="wrong-secret",
    )
    assert wrong.status_code == 403

    valid = mgr.post(
        "/api/v1/payments/mpesa-callback/",
        payload,
        format="json",
        HTTP_X_MPESA_CALLBACK_SECRET="super-secret-callback-key",
    )
    assert valid.status_code == 201
    assert valid.data["payment"]["receipt_number"].startswith("RCPT-")


@pytest.mark.django_db
def test_full_mvp_end_to_end_acceptance_and_cross_tenant_isolation():
    """End-to-end MVP acceptance workflow covering steps 1-9 across Web & Mobile endpoints."""
    manager_a = User.objects.create_user(email="mgr@kilimanicourt.co.ke", password="Password123!")
    manager_b = User.objects.create_user(email="mgr@rivalestates.co.ke", password="Password123!")

    org_a = Organization.objects.create(name="Kilimani Court Management")
    org_b = Organization.objects.create(name="Rival Estates")

    OrganizationMembership.objects.create(
        organization=org_a, user=manager_a, role=OrganizationRole.MANAGER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=manager_b, role=OrganizationRole.MANAGER
    )

    client_a = client_for(manager_a, org_a.id)
    client_b_own_org = client_for(manager_b, org_b.id)
    client_b_forged_org_a = client_for(manager_b, org_a.id)

    # 1. Create a property and two units
    prop_res = client_a.post(
        "/api/v1/properties/",
        {
            "name": "Kilimani Court",
            "property_type": "RESIDENTIAL",
            "address": "Argwings Kodhek Rd",
            "county": "Nairobi",
            "town": "Nairobi",
        },
        format="json",
    )
    assert prop_res.status_code == 201
    prop_id = prop_res.data["id"]

    unit1_res = client_a.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "KC-101",
            "unit_type": "2BR",
            "advertised_rent": "45000.00",
        },
        format="json",
    )
    unit2_res = client_a.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "KC-102",
            "unit_type": "1BR",
            "advertised_rent": "32000.00",
        },
        format="json",
    )
    assert unit1_res.status_code == 201
    assert unit2_res.status_code == 201
    unit1_id = unit1_res.data["id"]

    # 2. Register a tenant and create an active lease for one unit
    tenant_res = client_a.post(
        "/api/v1/tenants/",
        {
            "full_name": "Amina Ochieng",
            "phone": "+254712345678",
            "email": "amina@example.co.ke",
        },
        format="json",
    )
    assert tenant_res.status_code == 201
    tenant_id = tenant_res.data["id"]

    lease_res = client_a.post(
        "/api/v1/leases/",
        {
            "unit": unit1_id,
            "start_date": "2026-06-01",
            "rent_amount": "45000.00",
            "billing_frequency": "MONTHLY",
            "billing_day": 5,
            "required_deposit": "45000.00",
            "occupants": [{"tenant": tenant_id, "occupant_role": "PRIMARY"}],
        },
        format="json",
    )
    assert lease_res.status_code == 201
    lease_id = lease_res.data["id"]

    # 3. Generate the rent invoice according to the approved billing rule
    gen_res = client_a.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-06"},
        format="json",
    )
    assert gen_res.status_code == 201
    assert gen_res.data["created_count"] == 1
    invoice = gen_res.data["invoices"][0]
    invoice_id = invoice["id"]
    assert invoice["invoice_number"].startswith("INV-2026-")
    assert Decimal(invoice["total_amount"]) == Decimal("45000.00")
    assert Decimal(invoice["outstanding_balance"]) == Decimal("45000.00")

    # 4. Record a partial payment without auto-allocation first
    pay_res = client_a.post(
        "/api/v1/payments/",
        {
            "lease": lease_id,
            "payment_reference": "UAT-MPESA-202606",
            "method": "MPESA_PAYBILL",
            "amount": "20000.00",
            "payer_name": "Amina Ochieng",
            "payer_phone": "254712345678",
            "auto_allocate": False,
        },
        format="json",
    )
    assert pay_res.status_code == 201
    payment_id = pay_res.data["id"]
    receipt_number = pay_res.data["receipt_number"]

    # 5 & 6. Allocate payment to invoice & verify unique receipt reference
    alloc_res = client_a.post(
        f"/api/v1/payments/{payment_id}/allocate/",
        {"invoice": invoice_id, "amount": "20000.00"},
        format="json",
    )
    assert alloc_res.status_code == 200
    assert receipt_number.startswith("RCPT-")
    assert Decimal(alloc_res.data["allocated_amount"]) == Decimal("20000.00")
    assert Decimal(alloc_res.data["unallocated_amount"]) == Decimal("0.00")

    # 7. Remaining invoice balance and arrears are accurate
    inv_detail = client_a.get(f"/api/v1/invoices/{invoice_id}/")
    assert inv_detail.status_code == 200
    assert inv_detail.data["status"] == "PARTIAL"
    assert inv_detail.data["allocated_amount"] == "20000.00"
    assert inv_detail.data["outstanding_balance"] == "25000.00"

    # 8. Web and mobile API dashboard shows identical reconciled figures
    dash_res = client_a.get("/api/v1/reports/dashboard/")
    assert dash_res.status_code == 200
    assert dash_res.data["currency"] == "KES"
    assert dash_res.data["total_units"] == 2
    assert dash_res.data["occupied_units"] == 1
    assert dash_res.data["vacant_units"] == 1
    assert dash_res.data["occupancy_rate"] == "50.00"
    assert dash_res.data["total_billed"] == "45000.00"
    assert dash_res.data["total_collected"] == "20000.00"
    assert dash_res.data["total_arrears"] == "25000.00"
    assert dash_res.data["arrears_by_lease"][0]["outstanding_balance"] == "25000.00"

    # 9. Organization B cannot read or alter any Organization A record
    for path in (
        f"/api/v1/properties/{prop_id}/",
        f"/api/v1/units/{unit1_id}/",
        f"/api/v1/leases/{lease_id}/",
        f"/api/v1/invoices/{invoice_id}/",
        f"/api/v1/payments/{payment_id}/",
    ):
        assert client_b_forged_org_a.get(path).status_code == 403
        assert client_b_own_org.get(path).status_code == 404

    assert client_b_forged_org_a.get("/api/v1/reports/dashboard/").status_code == 403
    assert client_b_own_org.get("/api/v1/reports/dashboard/").data["total_billed"] == "0.00"
    assert (
        client_b_own_org.post(
            f"/api/v1/payments/{payment_id}/reverse/",
            {"reason": "Unauthorized cross-tenant reversal"},
            format="json",
        ).status_code
        == 404
    )
    assert (
        client_b_own_org.post(
            f"/api/v1/invoices/{invoice_id}/adjustments/",
            {"adjustment_type": "CREDIT_NOTE", "amount": "1000.00", "reason": "Tamper"},
            format="json",
        ).status_code
        == 404
    )
