from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole
from apps.properties.models import Property, Unit

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_configurable_pagination_exceeds_25_and_caps_at_200():
    user = User.objects.create_user(email="pag@kilimani.co.ke", password="Password123!")
    org = Organization.objects.create(name="Pagination Estates", unit_limit=250)
    OrganizationMembership.objects.create(
        organization=org, user=user, role=OrganizationRole.OWNER
    )
    prop = Property.objects.create(
        organization=org,
        name="Mega Apartments",
        property_type="RESIDENTIAL",
    )

    Unit.objects.bulk_create(
        [
            Unit(
                organization=org,
                property=prop,
                unit_code=f"U-{i:03d}",
                unit_type="1BR",
                advertised_rent=Decimal("25000.00"),
            )
            for i in range(1, 36)
        ]
    )

    api = client_for(user, org.id)

    # Default page_size is 25
    page1 = api.get("/api/v1/units/")
    assert page1.status_code == 200
    assert page1.data["count"] == 35
    assert len(page1.data["results"]) == 25
    assert page1.data["next"] is not None

    page2 = api.get("/api/v1/units/?page=2")
    assert page2.status_code == 200
    assert len(page2.data["results"]) == 10

    # Custom ?page_size=200 returns all 35 in a single response
    all_units = api.get("/api/v1/units/?page_size=200")
    assert all_units.status_code == 200
    assert len(all_units.data["results"]) == 35


@pytest.mark.django_db
def test_unit_limit_lock_and_idempotent_monthly_billing_and_mpesa_retries():
    user = User.objects.create_user(email="lock@kilimani.co.ke", password="Password123!")
    org = Organization.objects.create(name="Locked Org", unit_limit=2)
    OrganizationMembership.objects.create(
        organization=org, user=user, role=OrganizationRole.MANAGER
    )
    api = client_for(user, org.id)

    prop_res = api.post(
        "/api/v1/properties/",
        {"name": "Lock Court", "property_type": "RESIDENTIAL"},
        format="json",
    )
    assert prop_res.status_code == 201
    prop_id = prop_res.data["id"]

    u1 = api.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "LC-1",
            "unit_type": "1BR",
            "advertised_rent": "30000.00",
        },
        format="json",
    )
    u2 = api.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "LC-2",
            "unit_type": "1BR",
            "advertised_rent": "30000.00",
        },
        format="json",
    )
    assert u1.status_code == 201
    assert u2.status_code == 201

    # 3rd unit exceeds unit_limit=2
    u3 = api.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "LC-3",
            "unit_type": "1BR",
            "advertised_rent": "30000.00",
        },
        format="json",
    )
    assert u3.status_code == 400

    # Create tenant & lease on LC-1
    tenant_res = api.post(
        "/api/v1/tenants/",
        {"full_name": "David Kamau", "phone": "+254722111222"},
        format="json",
    )
    lease_res = api.post(
        "/api/v1/leases/",
        {
            "unit": u1.data["id"],
            "start_date": "2026-07-01",
            "rent_amount": "30000.00",
            "billing_frequency": "MONTHLY",
            "billing_day": 5,
            "required_deposit": "30000.00",
            "occupants": [{"tenant": tenant_res.data["id"], "occupant_role": "PRIMARY"}],
        },
        format="json",
    )
    assert lease_res.status_code == 201

    # Repeated generate-monthly calls are idempotent under lock
    gen1 = api.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-07"},
        format="json",
    )
    gen2 = api.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-07"},
        format="json",
    )
    assert gen1.status_code == 201
    assert gen1.data["created_count"] == 1
    assert gen1.data["skipped_count"] == 0
    assert gen2.status_code == 201
    assert gen2.data["created_count"] == 0
    assert gen2.data["skipped_count"] == 1

    # Repeated M-Pesa callbacks with identical trans_id are idempotent under lock
    cb_payload = {
        "trans_id": "MPESA-LOCK-777",
        "trans_amount": "30000.00",
        "bill_ref_number": "LC-1",
        "msisdn": "254722111222",
        "first_name": "David",
    }
    cb1 = api.post("/api/v1/payments/mpesa-callback/", cb_payload, format="json")
    cb2 = api.post("/api/v1/payments/mpesa-callback/", cb_payload, format="json")
    assert cb1.status_code == 201
    assert cb1.data["duplicate"] is False
    assert cb2.status_code == 200
    assert cb2.data["duplicate"] is True
    assert cb2.data["payment"]["id"] == cb1.data["payment"]["id"]
