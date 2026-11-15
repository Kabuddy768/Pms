from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.leasing.models import Lease, LeaseEvent, LeaseStatus, Tenant
from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole
from apps.properties.models import Property, Unit, UnitStatus

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_lease_creation_prevents_overlap_and_updates_unit_status():
    user = User.objects.create_user(email="mgr@kilimani.co.ke", password="Password123!")
    org = Organization.objects.create(name="Kilimani Estates")
    OrganizationMembership.objects.create(
        organization=org, user=user, role=OrganizationRole.MANAGER
    )
    prop = Property.objects.create(organization=org, name="Kilimani Heights")
    unit = Unit.objects.create(
        organization=org,
        property=prop,
        unit_code="A1",
        advertised_rent=Decimal("45000.00"),
    )
    t1 = Tenant.objects.create(organization=org, full_name="Jane Doe", phone="+254700000001")
    t2 = Tenant.objects.create(organization=org, full_name="John Doe", phone="+254700000002")

    client = client_for(user, org.id)
    res = client.post(
        "/api/v1/leases/",
        {
            "unit": str(unit.id),
            "start_date": "2026-01-01",
            "rent_amount": "45000.00",
            "required_deposit": "45000.00",
            "occupants": [{"tenant": str(t1.id), "occupant_role": "PRIMARY"}],
        },
        format="json",
    )
    assert res.status_code == 201
    lease_id = res.json()["id"]

    unit.refresh_from_db()
    assert unit.status == UnitStatus.OCCUPIED

    # Second active lease on the same unit must be rejected
    overlap = client.post(
        "/api/v1/leases/",
        {
            "unit": str(unit.id),
            "start_date": "2026-02-01",
            "rent_amount": "46000.00",
            "occupants": [{"tenant": str(t2.id), "occupant_role": "PRIMARY"}],
        },
        format="json",
    )
    assert overlap.status_code == 400

    # Terminating frees the unit
    term = client.post(
        f"/api/v1/leases/{lease_id}/terminate/",
        {"end_date": "2026-06-30", "reason": "Tenant moved out"},
        format="json",
    )
    assert term.status_code == 200
    assert term.json()["status"] == LeaseStatus.TERMINATED
    unit.refresh_from_db()
    assert unit.status == UnitStatus.VACANT


@pytest.mark.django_db
def test_lease_rent_amendment_and_deposit_ledger_permissions():
    manager = User.objects.create_user(email="mgr@est.co.ke", password="Password123!")
    accountant = User.objects.create_user(email="acc@est.co.ke", password="Password123!")
    org = Organization.objects.create(name="Estates Ltd")
    OrganizationMembership.objects.create(
        organization=org, user=manager, role=OrganizationRole.MANAGER
    )
    OrganizationMembership.objects.create(
        organization=org, user=accountant, role=OrganizationRole.ACCOUNTANT
    )

    prop = Property.objects.create(organization=org, name="Parklands")
    unit = Unit.objects.create(
        organization=org, property=prop, unit_code="B2", advertised_rent=Decimal("30000.00")
    )
    Tenant.objects.create(organization=org, full_name="Peter", phone="+254711111111")
    lease = Lease.objects.create(
        organization=org,
        unit=unit,
        start_date="2026-01-01",
        rent_amount=Decimal("30000.00"),
    )

    acc_client = client_for(accountant, org.id)
    mgr_client = client_for(manager, org.id)

    # Accountant cannot amend rent (403), Manager can
    assert (
        acc_client.post(
            f"/api/v1/leases/{lease.id}/amend-rent/",
            {"rent_amount": "33000.00", "reason": "Annual escalation"},
            format="json",
        ).status_code
        == 403
    )
    amend = mgr_client.post(
        f"/api/v1/leases/{lease.id}/amend-rent/",
        {"rent_amount": "33000.00", "reason": "Annual escalation"},
        format="json",
    )
    assert amend.status_code == 200
    assert LeaseEvent.objects.filter(lease=lease, event_type="RENT_AMENDED").exists()

    # Accountant can record deposit RECEIVED, cannot REFUND/DEDUCT
    dep_in = acc_client.post(
        f"/api/v1/leases/{lease.id}/deposit-transactions/",
        {"transaction_type": "RECEIVED", "amount": "30000.00", "reference": "MPESA123"},
        format="json",
    )
    assert dep_in.status_code == 201
    assert dep_in.json()["held_balance"] == "30000.00"

    assert (
        acc_client.post(
            f"/api/v1/leases/{lease.id}/deposit-transactions/",
            {"transaction_type": "REFUNDED", "amount": "5000.00"},
            format="json",
        ).status_code
        == 403
    )

    # Manager cannot refund more than held balance
    over_refund = mgr_client.post(
        f"/api/v1/leases/{lease.id}/deposit-transactions/",
        {"transaction_type": "REFUNDED", "amount": "40000.00"},
        format="json",
    )
    assert over_refund.status_code == 400

    valid_refund = mgr_client.post(
        f"/api/v1/leases/{lease.id}/deposit-transactions/",
        {"transaction_type": "REFUNDED", "amount": "10000.00", "reference": "REF1"},
        format="json",
    )
    assert valid_refund.status_code == 201
    assert valid_refund.json()["held_balance"] == "20000.00"


@pytest.mark.django_db
def test_cross_tenant_isolation_on_tenants_and_leases():
    user_a = User.objects.create_user(email="a@a.co.ke", password="Password123!")
    user_b = User.objects.create_user(email="b@b.co.ke", password="Password123!")
    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")
    OrganizationMembership.objects.create(
        organization=org_a, user=user_a, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=user_b, role=OrganizationRole.OWNER
    )

    prop_a = Property.objects.create(organization=org_a, name="A Court")
    unit_a = Unit.objects.create(
        organization=org_a, property=prop_a, unit_code="A1", advertised_rent=Decimal("20000.00")
    )
    tenant_a = Tenant.objects.create(
        organization=org_a, full_name="Tenant A", phone="+254700000099"
    )
    lease_a = Lease.objects.create(
        organization=org_a, unit=unit_a, start_date="2026-01-01", rent_amount=Decimal("20000.00")
    )

    client_b = client_for(user_b, org_b.id)
    assert client_b.get("/api/v1/tenants/").json()["count"] == 0
    assert client_b.get(f"/api/v1/tenants/{tenant_a.id}/").status_code == 404
    assert client_b.get(f"/api/v1/leases/{lease_a.id}/").status_code == 404
    assert (
        client_b.post(
            "/api/v1/leases/",
            {
                "unit": str(unit_a.id),
                "start_date": "2026-01-01",
                "rent_amount": "20000.00",
                "occupants": [{"tenant": str(tenant_a.id), "occupant_role": "PRIMARY"}],
            },
            format="json",
        ).status_code
        == 400
    )
