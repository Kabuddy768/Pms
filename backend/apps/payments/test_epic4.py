from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceStatus
from apps.leasing.models import Lease, LeaseOccupant, Tenant
from apps.organizations.models import Organization, OrganizationMembership, OrganizationRole
from apps.payments.models import Payment, PaymentStatus
from apps.properties.models import Property, Unit

User = get_user_model()


def client_for(user, org_id) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_ORGANIZATION_ID=str(org_id))
    return client


def setup_org_with_lease(email="mgr@kilimani.co.ke", role=OrganizationRole.MANAGER):
    user = User.objects.create_user(email=email, password="Password123!")
    org = Organization.objects.create(name=f"Org {email}")
    OrganizationMembership.objects.create(organization=org, user=user, role=role)
    prop = Property.objects.create(organization=org, name="Kilimani Heights")
    unit = Unit.objects.create(
        organization=org, property=prop, unit_code="A1", advertised_rent=Decimal("30000.00")
    )
    tenant = Tenant.objects.create(
        organization=org, full_name="Grace Muthoni", phone="+254712345678"
    )
    lease = Lease.objects.create(
        organization=org,
        unit=unit,
        start_date="2026-01-01",
        rent_amount=Decimal("30000.00"),
        billing_day=5,
    )
    LeaseOccupant.objects.create(organization=org, lease=lease, tenant=tenant)
    return user, org, lease, tenant


@pytest.mark.django_db
def test_monthly_billing_idempotency_and_overpayment_auto_apply():
    user, org, lease, _ = setup_org_with_lease()
    client = client_for(user, org.id)

    # 1. Generate 2026-10 monthly invoice
    gen1 = client.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-10"},
        format="json",
    )
    assert gen1.status_code == 201
    assert gen1.json()["created_count"] == 1
    inv_id = gen1.json()["invoices"][0]["id"]

    # Repeated execution must not duplicate
    gen2 = client.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-10"},
        format="json",
    )
    assert gen2.status_code == 201
    assert gen2.json()["created_count"] == 0
    assert gen2.json()["skipped_count"] == 1

    # 2. Tenant pays KES 40,000 (10,000 overpayment)
    pay = client.post(
        "/api/v1/payments/",
        {
            "lease": str(lease.id),
            "payment_reference": "SJK100001",
            "method": "MPESA_PAYBILL",
            "amount": "40000.00",
        },
        format="json",
    )
    assert pay.status_code == 201
    assert pay.json()["receipt_number"].startswith("RCPT-")
    assert pay.json()["allocated_amount"] == "30000.00"
    assert pay.json()["unallocated_amount"] == "10000.00"
    assert Invoice.objects.get(id=inv_id).status == InvoiceStatus.PAID

    # 3. Generate 2026-11 invoice -> remaining KES 10,000 credit auto-applies
    gen3 = client.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-11"},
        format="json",
    )
    assert gen3.status_code == 201
    nov_inv = gen3.json()["invoices"][0]
    assert nov_inv["allocated_amount"] == "10000.00"
    assert nov_inv["outstanding_balance"] == "20000.00"
    assert nov_inv["status"] == InvoiceStatus.PARTIAL


@pytest.mark.django_db
def test_mpesa_callback_auto_match_idempotency_and_suspense_assign():
    user, org, lease, _ = setup_org_with_lease(email="acc@est.co.ke")
    client = client_for(user, org.id)
    client.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-11"},
        format="json",
    )

    # 1. Messy Kenyan BillRefNumber ("Hse A1") auto-matches and allocates
    cb1 = client.post(
        "/api/v1/payments/mpesa-callback/",
        {
            "trans_id": "MPESA_CB_01",
            "trans_amount": "15000.00",
            "bill_ref_number": "Hse A1",
            "msisdn": "254799999999",
            "first_name": "GRACE",
        },
        format="json",
    )
    assert cb1.status_code == 201
    assert cb1.json()["processing_status"] == "MATCHED"
    assert cb1.json()["payment"]["allocated_amount"] == "15000.00"

    # 2. Duplicate callback with same trans_id is idempotent
    cb_dup = client.post(
        "/api/v1/payments/mpesa-callback/",
        {
            "trans_id": "MPESA_CB_01",
            "trans_amount": "15000.00",
            "bill_ref_number": "Hse A1",
            "msisdn": "254799999999",
            "first_name": "GRACE",
        },
        format="json",
    )
    assert cb_dup.status_code == 200
    assert cb_dup.json()["duplicate"] is True
    assert Payment.objects.filter(organization=org).count() == 1

    # 3. Unmatched callback lands in Suspense queue
    cb_unmatched = client.post(
        "/api/v1/payments/mpesa-callback/",
        {
            "trans_id": "MPESA_CB_02",
            "trans_amount": "15000.00",
            "bill_ref_number": "WRONG_CODE",
            "msisdn": "254788888888",
            "first_name": "SPOUSE",
        },
        format="json",
    )
    assert cb_unmatched.status_code == 201
    assert cb_unmatched.json()["processing_status"] == "UNMATCHED"
    suspense_id = cb_unmatched.json()["payment"]["id"]

    suspense_list = client.get("/api/v1/payments/?unmatched=true").json()
    assert suspense_list["count"] == 1

    # 4. Manual assign clears Suspense and pays off remaining invoice balance
    assigned = client.post(
        f"/api/v1/payments/{suspense_id}/assign/",
        {"lease": str(lease.id), "auto_allocate": True},
        format="json",
    )
    assert assigned.status_code == 200
    assert assigned.json()["is_matched"] is True
    assert assigned.json()["allocated_amount"] == "15000.00"
    assert Invoice.objects.get(organization=org, lease=lease).status == InvoiceStatus.PAID


@pytest.mark.django_db
def test_payment_reversal_and_credit_note_permissions_and_cross_tenant():
    mgr, org_a, lease_a, _ = setup_org_with_lease(
        email="mgr@a.co.ke", role=OrganizationRole.MANAGER
    )
    acc = User.objects.create_user(email="acc@a.co.ke", password="Password123!")
    OrganizationMembership.objects.create(
        organization=org_a, user=acc, role=OrganizationRole.ACCOUNTANT
    )
    other_user, org_b, _, _ = setup_org_with_lease(email="own@b.co.ke", role=OrganizationRole.OWNER)

    acc_client = client_for(acc, org_a.id)
    mgr_client = client_for(mgr, org_a.id)
    b_client = client_for(other_user, org_b.id)

    gen = acc_client.post(
        "/api/v1/invoices/generate-monthly/",
        {"billing_period": "2026-11"},
        format="json",
    )
    inv_id = gen.json()["invoices"][0]["id"]

    pay = acc_client.post(
        "/api/v1/payments/",
        {
            "lease": str(lease_a.id),
            "payment_reference": "BNK999",
            "method": "BANK_TRANSFER",
            "amount": "20000.00",
        },
        format="json",
    )
    pay_id = pay.json()["id"]

    # Accountant cannot reverse payment (403)
    assert (
        acc_client.post(
            f"/api/v1/payments/{pay_id}/reverse/",
            {"reason": "Bounced cheque"},
            format="json",
        ).status_code
        == 403
    )

    # Cross-tenant Org B cannot read or reverse Org A invoice/payment
    assert b_client.get(f"/api/v1/invoices/{inv_id}/").status_code == 404
    assert b_client.get(f"/api/v1/payments/{pay_id}/").status_code == 404

    # Manager reverses payment -> invoice returns to ISSUED
    rev = mgr_client.post(
        f"/api/v1/payments/{pay_id}/reverse/",
        {"reason": "Wrong entry"},
        format="json",
    )
    assert rev.status_code == 200
    assert rev.json()["status"] == PaymentStatus.REVERSED
    inv = Invoice.objects.get(id=inv_id)
    assert inv.status == InvoiceStatus.ISSUED
    assert inv.outstanding_balance() == Decimal("30000.00")

    # Manager issues Credit Note of 5000.00
    adj = mgr_client.post(
        f"/api/v1/invoices/{inv_id}/adjustments/",
        {"adjustment_type": "CREDIT", "amount": "5000.00", "reason": "Sink repair"},
        format="json",
    )
    assert adj.status_code == 201
    assert adj.json()["outstanding_balance"] == "25000.00"
