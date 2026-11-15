from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole
from apps.properties.models import Building, Owner, Property, Unit

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_property_building_unit_lifecycle_and_decimal_rent():
    user = User.objects.create_user(email="mgr@kilimani.co.ke", password="Password123!")
    org = Organization.objects.create(name="Kilimani Portfolio")
    OrganizationMembership.objects.create(
        organization=org, user=user, role=OrganizationRole.MANAGER
    )
    client = client_for(user, org.id)

    prop_res = client.post(
        "/api/v1/properties/",
        {
            "name": "Kilimani Heights",
            "property_type": "RESIDENTIAL",
            "address": "Argwings Kodhek Rd",
            "county": "Nairobi",
            "town": "Kilimani",
        },
        format="json",
    )
    assert prop_res.status_code == 201
    prop_id = prop_res.json()["id"]

    bldg_res = client.post(
        "/api/v1/buildings/",
        {"property": prop_id, "name": "Block A"},
        format="json",
    )
    assert bldg_res.status_code == 201
    bldg_id = bldg_res.json()["id"]

    unit_res = client.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "building": bldg_id,
            "unit_code": " a4 ",
            "unit_type": "2BR",
            "advertised_rent": "45000.00",
        },
        format="json",
    )
    assert unit_res.status_code == 201
    assert unit_res.json()["unit_code"] == "A4"
    assert Unit.objects.get(id=unit_res.json()["id"]).advertised_rent == Decimal("45000.00")

    # Duplicate unit_code in same property rejected
    dup_res = client.post(
        "/api/v1/units/",
        {
            "property": prop_id,
            "unit_code": "A4",
            "unit_type": "1BR",
            "advertised_rent": "30000.00",
        },
        format="json",
    )
    assert dup_res.status_code == 400


@pytest.mark.django_db
def test_cross_tenant_isolation_on_portfolio_and_foreign_keys():
    user_a = User.objects.create_user(email="a@org-a.co.ke", password="Password123!")
    user_b = User.objects.create_user(email="b@org-b.co.ke", password="Password123!")
    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")
    OrganizationMembership.objects.create(
        organization=org_a, user=user_a, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=user_b, role=OrganizationRole.OWNER
    )

    prop_a = Property.objects.create(organization=org_a, name="Amani Court")
    bldg_a = Building.objects.create(organization=org_a, property=prop_a, name="Block 1")
    unit_a = Unit.objects.create(
        organization=org_a,
        property=prop_a,
        building=bldg_a,
        unit_code="A1",
        advertised_rent=Decimal("25000.00"),
    )
    owner_a = Owner.objects.create(organization=org_a, full_name="John Kamau")

    client_b = client_for(user_b, org_b.id)
    assert client_b.get("/api/v1/properties/").json()["count"] == 0
    assert client_b.get(f"/api/v1/properties/{prop_a.id}/").status_code == 404
    assert client_b.patch(
        f"/api/v1/units/{unit_a.id}/", {"advertised_rent": "100.00"}, format="json"
    ).status_code == 404
    assert client_b.get(f"/api/v1/owners/{owner_a.id}/").status_code == 404

    # Org B cannot attach a unit to Org A's property
    cross_unit = client_b.post(
        "/api/v1/units/",
        {
            "property": str(prop_a.id),
            "unit_code": "HACK1",
            "advertised_rent": "10000.00",
        },
        format="json",
    )
    assert cross_unit.status_code == 400


@pytest.mark.django_db
def test_caretaker_read_only_and_ownership_share_sum_validation():
    owner_user = User.objects.create_user(email="own@est.co.ke", password="Password123!")
    caretaker_user = User.objects.create_user(email="care@est.co.ke", password="Password123!")
    org = Organization.objects.create(name="Westlands Estates")
    OrganizationMembership.objects.create(
        organization=org, user=owner_user, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org, user=caretaker_user, role=OrganizationRole.CARETAKER
    )

    prop = Property.objects.create(organization=org, name="Westlands Plaza")
    o1 = Owner.objects.create(organization=org, full_name="Owner One")
    o2 = Owner.objects.create(organization=org, full_name="Owner Two")

    # Caretaker can read, cannot create
    c_client = client_for(caretaker_user, org.id)
    assert c_client.get("/api/v1/properties/").status_code == 200
    assert (
        c_client.post(
            "/api/v1/properties/", {"name": "Blocked"}, format="json"
        ).status_code
        == 403
    )

    # Ownership shares must sum to 100.00%
    o_client = client_for(owner_user, org.id)
    bad_shares = o_client.post(
        f"/api/v1/properties/{prop.id}/owners/",
        {
            "owners": [
                {"owner": str(o1.id), "ownership_share": "60.00", "valid_from": "2026-01-01"},
                {"owner": str(o2.id), "ownership_share": "30.00", "valid_from": "2026-01-01"},
            ]
        },
        format="json",
    )
    assert bad_shares.status_code == 400

    good_shares = o_client.post(
        f"/api/v1/properties/{prop.id}/owners/",
        {
            "owners": [
                {"owner": str(o1.id), "ownership_share": "60.00", "valid_from": "2026-01-01"},
                {"owner": str(o2.id), "ownership_share": "40.00", "valid_from": "2026-01-01"},
            ]
        },
        format="json",
    )
    assert good_shares.status_code == 200
    assert len(good_shares.json()) == 2
