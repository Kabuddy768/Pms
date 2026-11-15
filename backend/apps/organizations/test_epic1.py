import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.organizations.models import (
    MembershipStatus,
    Organization,
    OrganizationMembership,
    OrganizationRole,
)

User = get_user_model()


def auth_client_for(user, org_id=None) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    if org_id is not None:
        client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_register_with_organization_creates_owner_and_audit_event():
    client = APIClient()
    response = client.post(
        "/api/v1/auth/register/",
        {
            "email": "alice@kilimani.co.ke",
            "full_name": "Alice Wanjiku",
            "password": "StrongPassword123!",
            "organization_name": "Kilimani Estates",
        },
        format="json",
    )
    assert response.status_code == 201
    payload = response.json()
    assert "access" in payload
    assert "refresh" in payload
    assert len(payload["user"]["memberships"]) == 1
    assert payload["user"]["memberships"][0]["role"] == OrganizationRole.OWNER

    org = Organization.objects.get(name="Kilimani Estates")
    assert AuditEvent.objects.filter(
        organization=org, action="ORGANIZATION_CREATED"
    ).exists()


@pytest.mark.django_db
def test_login_rejects_invalid_credentials_and_inactive_user():
    user = User.objects.create_user(
        email="bob@example.com", password="CorrectPassword123!"
    )
    client = APIClient()

    bad = client.post(
        "/api/v1/auth/token/",
        {"email": "bob@example.com", "password": "WrongPassword"},
        format="json",
    )
    assert bad.status_code == 401

    user.is_active = False
    user.save(update_fields=["is_active"])
    inactive = client.post(
        "/api/v1/auth/token/",
        {"email": "bob@example.com", "password": "CorrectPassword123!"},
        format="json",
    )
    assert inactive.status_code == 401


@pytest.mark.django_db
def test_cross_tenant_isolation_blocks_foreign_organization_header():
    user_a = User.objects.create_user(email="a@org-a.com", password="Password123!")
    user_b = User.objects.create_user(email="b@org-b.com", password="Password123!")

    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")

    OrganizationMembership.objects.create(
        organization=org_a, user=user_a, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=user_b, role=OrganizationRole.OWNER
    )

    # User B probing Org A endpoints with Org A's header must fail with 403
    client_b_probing_a = auth_client_for(user_b, org_id=org_a.id)
    assert client_b_probing_a.get("/api/v1/organizations/current/").status_code == 403
    assert client_b_probing_a.get("/api/v1/organizations/members/").status_code == 403
    assert (
        client_b_probing_a.post(
            "/api/v1/organizations/members/",
            {"email": "a@org-a.com", "role": "CARETAKER"},
            format="json",
        ).status_code
        == 403
    )
    assert client_b_probing_a.get("/api/v1/audit-events/").status_code == 403

    # Missing or malformed header must fail with 403
    client_no_header = auth_client_for(user_a, org_id=None)
    assert client_no_header.get("/api/v1/organizations/current/").status_code == 403

    client_bad_header = auth_client_for(user_a, org_id="not-a-uuid")
    assert client_bad_header.get("/api/v1/organizations/current/").status_code == 403


@pytest.mark.django_db
def test_suspended_membership_loses_access():
    user = User.objects.create_user(email="suspended@org.com", password="Password123!")
    org = Organization.objects.create(name="Suspended Test Org")
    OrganizationMembership.objects.create(
        organization=org,
        user=user,
        role=OrganizationRole.MANAGER,
        status=MembershipStatus.SUSPENDED,
    )
    client = auth_client_for(user, org_id=org.id)
    assert client.get("/api/v1/organizations/current/").status_code == 403


@pytest.mark.django_db
def test_role_permissions_and_last_owner_protection():
    owner = User.objects.create_user(email="owner@org.com", password="Password123!")
    caretaker = User.objects.create_user(email="caretaker@org.com", password="Password123!")
    org = Organization.objects.create(name="Westlands Towers")

    owner_m = OrganizationMembership.objects.create(
        organization=org, user=owner, role=OrganizationRole.OWNER
    )
    OrganizationMembership.objects.create(
        organization=org, user=caretaker, role=OrganizationRole.CARETAKER
    )

    # Caretaker can view current org & member list, but cannot add members or view audit logs
    caretaker_client = auth_client_for(caretaker, org_id=org.id)
    assert caretaker_client.get("/api/v1/organizations/current/").status_code == 200
    assert caretaker_client.get("/api/v1/organizations/members/").status_code == 200
    assert caretaker_client.get("/api/v1/audit-events/").status_code == 403
    assert (
        caretaker_client.post(
            "/api/v1/organizations/members/",
            {"email": "new@org.com", "role": "ACCOUNTANT"},
            format="json",
        ).status_code
        == 403
    )

    # Owner cannot demote themselves if they are the last active owner
    owner_client = auth_client_for(owner, org_id=org.id)
    demote_res = owner_client.patch(
        f"/api/v1/organizations/members/{owner_m.id}/",
        {"role": OrganizationRole.MANAGER},
        format="json",
    )
    assert demote_res.status_code == 400
    assert owner_client.get("/api/v1/audit-events/").status_code == 200

    # Owner can provision a brand new user account directly when adding a member
    add_new = owner_client.post(
        "/api/v1/organizations/members/",
        {
            "email": "newaccountant@org.com",
            "full_name": "Grace Njeri",
            "password": "Password123!",
            "role": OrganizationRole.ACCOUNTANT,
        },
        format="json",
    )
    assert add_new.status_code == 201
    assert add_new.data["email"] == "newaccountant@org.com"
    assert add_new.data["full_name"] == "Grace Njeri"
    assert add_new.data["role"] == OrganizationRole.ACCOUNTANT
