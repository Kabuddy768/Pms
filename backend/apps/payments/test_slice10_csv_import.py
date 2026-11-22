from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole
from apps.payments.models import Payment

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


@pytest.mark.django_db
def test_csv_reconciliation_dry_run_commit_duplicates_and_isolation():
    accountant_a = User.objects.create_user(email="acc@a.co.ke", password="Password123!")
    caretaker_a = User.objects.create_user(email="care@a.co.ke", password="Password123!")
    mgr_b = User.objects.create_user(email="mgr@b.co.ke", password="Password123!")

    org_a = Organization.objects.create(name="Recon Org A")
    org_b = Organization.objects.create(name="Recon Org B")
    OrganizationMembership.objects.create(
        organization=org_a, user=accountant_a, role=OrganizationRole.ACCOUNTANT
    )
    OrganizationMembership.objects.create(
        organization=org_a, user=caretaker_a, role=OrganizationRole.CARETAKER
    )
    OrganizationMembership.objects.create(
        organization=org_b, user=mgr_b, role=OrganizationRole.MANAGER
    )

    c_a = client_for(accountant_a, org_a.id)
    c_care = client_for(caretaker_a, org_a.id)
    c_b_forged = client_for(mgr_b, org_a.id)

    prop = c_a.post(
        "/api/v1/properties/",
        {"name": "South C Suites", "property_type": "RESIDENTIAL"},
        format="json",
    ).data
    unit = c_a.post(
        "/api/v1/units/",
        {
            "property": prop["id"],
            "unit_code": "SC-101",
            "unit_type": "1BR",
            "advertised_rent": "30000.00",
        },
        format="json",
    ).data
    tenant = c_a.post(
        "/api/v1/tenants/",
        {"full_name": "Peter Mwangi", "phone": "+254712345678"},
        format="json",
    ).data
    lease = c_a.post(
        "/api/v1/leases/",
        {
            "unit": unit["id"],
            "start_date": "2026-10-01",
            "rent_amount": "30000.00",
            "billing_frequency": "MONTHLY",
            "billing_day": 5,
            "required_deposit": "30000.00",
            "occupants": [{"tenant": tenant["id"], "occupant_role": "PRIMARY"}],
        },
        format="json",
    ).data

    inv = c_a.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-10"},
        format="json",
    ).data["invoices"][0]

    # Seed one pre-existing payment to test existing duplicate detection
    c_a.post(
        "/api/v1/payments/",
        {
            "lease": lease["id"],
            "payment_reference": "EXISTING-REF-01",
            "method": "BANK_TRANSFER",
            "amount": "10000.00",
            "auto_allocate": True,
        },
        format="json",
    )

    csv_payload = {
        "dry_run": True,
        "rows": [
            {
                "reference": "MPESA-CSV-100",
                "amount": "20000.00",
                "account_ref": "SC-101",
                "phone": "254712345678",
                "payer_name": "Peter Mwangi",
                "method": "MPESA_PAYBILL",
            },
            {
                "reference": "BANK-CSV-101",
                "amount": "15000.00",
                "account_ref": "TYPO-999",
                "phone": "254799000111",
                "payer_name": "Unknown Sender",
                "method": "BANK_TRANSFER",
            },
            {
                "reference": "EXISTING-REF-01",
                "amount": "10000.00",
                "account_ref": "SC-101",
                "method": "BANK_TRANSFER",
            },
            {
                "reference": "MPESA-CSV-100",
                "amount": "20000.00",
                "account_ref": "SC-101",
                "method": "MPESA_PAYBILL",
            },
        ],
    }

    # Caretaker & foreign org blocked
    assert (
        c_care.post("/api/v1/payments/import-csv/", csv_payload, format="json").status_code
        == 403
    )
    assert (
        c_b_forged.post("/api/v1/payments/import-csv/", csv_payload, format="json").status_code
        == 403
    )

    # Dry run must preview accurately without creating rows
    preview = c_a.post("/api/v1/payments/import-csv/", csv_payload, format="json")
    assert preview.status_code == 200
    assert preview.data["dry_run"] is True
    assert preview.data["matched_count"] == 1
    assert preview.data["unmatched_suspense_count"] == 1
    assert preview.data["duplicate_skipped_count"] == 2
    assert Payment.objects.filter(organization=org_a).count() == 1

    # Commit run creates the 2 non-duplicate payments and settles the invoice
    commit_payload = {**csv_payload, "dry_run": False}
    commit = c_a.post("/api/v1/payments/import-csv/", commit_payload, format="json")
    assert commit.status_code == 201
    assert commit.data["matched_count"] == 1
    assert commit.data["unmatched_suspense_count"] == 1
    assert commit.data["duplicate_skipped_count"] == 2
    assert commit.data["rows"][0]["receipt_number"].startswith("RCPT-")
    assert Payment.objects.filter(organization=org_a).count() == 3

    inv_after = c_a.get(f"/api/v1/invoices/{inv['id']}/").data
    assert inv_after["status"] == "PAID"
    assert Decimal(inv_after["outstanding_balance"]) == Decimal("0.00")

    assert AuditEvent.objects.filter(
        organization=org_a, action="PAYMENTS_CSV_IMPORTED"
    ).exists()
