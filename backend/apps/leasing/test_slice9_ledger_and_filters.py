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
def test_tenant_running_ledger_ordering_filtering_and_cross_tenant_isolation():
    mgr_a = User.objects.create_user(email="mgr@a.co.ke", password="Password123!")
    mgr_b = User.objects.create_user(email="mgr@b.co.ke", password="Password123!")
    org_a = Organization.objects.create(name="Ledger Org A")
    org_b = Organization.objects.create(name="Ledger Org B")
    OrganizationMembership.objects.create(
        organization=org_a, user=mgr_a, role=OrganizationRole.MANAGER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=mgr_b, role=OrganizationRole.MANAGER
    )

    c_a = client_for(mgr_a, org_a.id)
    c_b_own = client_for(mgr_b, org_b.id)
    c_b_forged = client_for(mgr_b, org_a.id)

    prop = c_a.post(
        "/api/v1/properties/",
        {"name": "Lavington Greens", "property_type": "RESIDENTIAL"},
        format="json",
    ).data
    unit = c_a.post(
        "/api/v1/units/",
        {
            "property": prop["id"],
            "unit_code": "LG-1",
            "unit_type": "2BR",
            "advertised_rent": "50000.00",
        },
        format="json",
    ).data

    t_res = c_a.post(
        "/api/v1/tenants/",
        {"full_name": "Beatrice Wambui", "phone": "+254711000111"},
        format="json",
    )
    tenant_id = t_res.data["id"]

    lease = c_a.post(
        "/api/v1/leases/",
        {
            "unit": unit["id"],
            "start_date": "2026-08-01",
            "rent_amount": "50000.00",
            "billing_frequency": "MONTHLY",
            "billing_day": 5,
            "required_deposit": "50000.00",
            "occupants": [{"tenant": tenant_id, "occupant_role": "PRIMARY"}],
        },
        format="json",
    ).data

    inv = c_a.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-08"},
        format="json",
    ).data["invoices"][0]

    # Credit adjustment of 5,000.00 -> net due 45,000.00
    adj = c_a.post(
        f"/api/v1/invoices/{inv['id']}/adjustments/",
        {"adjustment_type": "CREDIT", "amount": "5000.00", "reason": "Plumbing credit"},
        format="json",
    )
    assert adj.status_code == 201

    # Partial payment of 20,000.00 -> net balance 25,000.00
    pay = c_a.post(
        "/api/v1/payments/",
        {
            "lease": lease["id"],
            "payment_reference": "MPESA-LEDGER-1",
            "method": "MPESA_PAYBILL",
            "amount": "20000.00",
            "auto_allocate": True,
        },
        format="json",
    )
    assert pay.status_code == 201

    ledger_res = c_a.get(f"/api/v1/tenants/{tenant_id}/ledger/")
    assert ledger_res.status_code == 200
    assert ledger_res.data["currency"] == "KES"
    assert ledger_res.data["total_billed"] == "50000.00"
    assert ledger_res.data["total_paid"] == "25000.00"
    assert ledger_res.data["current_balance"] == "25000.00"
    assert len(ledger_res.data["entries"]) == 3
    assert Decimal(ledger_res.data["entries"][-1]["running_balance"]) == Decimal("25000.00")

    # Cross-tenant negative checks on tenant ledger
    assert c_b_own.get(f"/api/v1/tenants/{tenant_id}/ledger/").status_code == 404
    assert c_b_forged.get(f"/api/v1/tenants/{tenant_id}/ledger/").status_code == 403

    # Verify ordering + filter query params work cleanly
    inv_list = c_a.get("/api/v1/invoices/?ordering=-total_amount&status=PARTIAL")
    assert inv_list.status_code == 200
    assert inv_list.data["count"] == 1

    pay_list = c_a.get("/api/v1/payments/?method=MPESA_PAYBILL&search=LEDGER-1")
    assert pay_list.status_code == 200
    assert pay_list.data["count"] == 1
