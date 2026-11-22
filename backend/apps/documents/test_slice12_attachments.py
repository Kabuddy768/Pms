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
def test_url_only_attachments_rbac_and_cross_tenant_isolation():
    mgr_a = User.objects.create_user(email="mgr@a.co.ke", password="Password123!")
    care_a = User.objects.create_user(email="care@a.co.ke", password="Password123!")
    mgr_b = User.objects.create_user(email="mgr@b.co.ke", password="Password123!")

    org_a = Organization.objects.create(name="Attach Org A")
    org_b = Organization.objects.create(name="Attach Org B")
    OrganizationMembership.objects.create(
        organization=org_a, user=mgr_a, role=OrganizationRole.MANAGER
    )
    OrganizationMembership.objects.create(
        organization=org_a, user=care_a, role=OrganizationRole.CARETAKER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=mgr_b, role=OrganizationRole.MANAGER
    )

    c_mgr = client_for(mgr_a, org_a.id)
    c_care = client_for(care_a, org_a.id)
    c_b_own = client_for(mgr_b, org_b.id)
    c_b_forged = client_for(mgr_b, org_a.id)

    prop = c_mgr.post(
        "/api/v1/properties/",
        {"name": "Westlands View", "property_type": "RESIDENTIAL"},
        format="json",
    ).data
    maint = c_care.post(
        "/api/v1/maintenance-requests/",
        {"property": prop["id"], "title": "Broken gate sensor", "priority": "HIGH"},
        format="json",
    ).data
    cat = c_mgr.post(
        "/api/v1/expense-categories/", {"name": "Electrical"}, format="json"
    ).data
    exp = c_mgr.post(
        "/api/v1/expenses/",
        {
            "property": prop["id"],
            "category": cat["id"],
            "description": "Gate sensor part",
            "amount": "4500.00",
            "expense_date": "2026-11-10",
        },
        format="json",
    ).data

    # Reject base64 / data URIs (D-020: URL-only object storage)
    blob_res = c_care.post(
        "/api/v1/attachments/",
        {
            "entity_type": "MAINTENANCE",
            "entity_id": maint["id"],
            "title": "Inline blob",
            "file_url": "data:image/png;base64,iVBORw0KGgo=",
        },
        format="json",
    )
    assert blob_res.status_code == 400

    # Caretaker can attach maintenance photo URL
    ok_res = c_care.post(
        "/api/v1/attachments/",
        {
            "entity_type": "MAINTENANCE",
            "entity_id": maint["id"],
            "title": "Gate photo",
            "file_url": "https://cdn.example.com/pms/gate-photo.jpg",
            "content_type": "image/jpeg",
        },
        format="json",
    )
    assert ok_res.status_code == 201
    att_id = ok_res.data["id"]

    # Caretaker cannot attach EXPENSE documents or delete attachments
    assert (
        c_care.post(
            "/api/v1/attachments/",
            {
                "entity_type": "EXPENSE",
                "entity_id": exp["id"],
                "title": "Receipt",
                "file_url": "https://cdn.example.com/pms/receipt.pdf",
            },
            format="json",
        ).status_code
        == 403
    )
    assert c_care.delete(f"/api/v1/attachments/{att_id}/").status_code == 403

    # Manager can filter attachments and delete
    list_res = c_mgr.get(
        f"/api/v1/attachments/?entity_type=MAINTENANCE&entity_id={maint['id']}"
    )
    assert list_res.status_code == 200
    assert list_res.data["count"] == 1

    # Cross-tenant negative checks
    assert (
        c_b_own.post(
            "/api/v1/attachments/",
            {
                "entity_type": "MAINTENANCE",
                "entity_id": maint["id"],
                "title": "Cross tenant attach",
                "file_url": "https://cdn.example.com/pms/bad.jpg",
            },
            format="json",
        ).status_code
        == 400
    )
    assert c_b_own.get(f"/api/v1/attachments/{att_id}/").status_code == 404
    assert c_b_forged.get("/api/v1/attachments/").status_code == 403

    assert c_mgr.delete(f"/api/v1/attachments/{att_id}/").status_code == 204
