# Security & Privacy Review (PMS-080)

**Scope:** PMS Modular Monolith (`backend/` Django 5.2 + DRF, `web/` Next.js, `mobile/` Expo, PostgreSQL)  
**Target Market:** Kenyan real estate operations (M-Pesa Paybill/C2B reconciliation, multi-tenant SaaS)

---

## 1. Threat Review (STRIDE Summary)

| Threat Category | Attack Surface | Implemented Mitigation |
| --- | --- | --- |
| **Spoofing** | Auth & M-Pesa callback ingress | Short-lived JWT access tokens (`30m`) + refresh (`7d`); optional `MPESA_CALLBACK_SECRET` (`X-Mpesa-Callback-Secret`) verified with constant-time `hmac.compare_digest`. |
| **Tampering** | Cross-tenant FK references & financial history | Every serializer validates `organization_id` on related `Property`, `Building`, `Unit`, `Tenant`, `Lease`, `Invoice`, `ExpenseCategory`, and `assigned_to` memberships. Ledgers are append-only (`InvoiceAdjustment`, `PaymentReversal`, `DepositTransaction`, `LeaseEvent`, `AuditEvent`). |
| **Repudiation** | Sensitive financial/leasing mutations | `record_audit_event` records `actor_user`, `action`, `entity_type`, `entity_id`, timestamp, and structured metadata across org, portfolio, leasing, billing, payments, expenses, and maintenance actions. |
| **Information Disclosure** | Cross-tenant reads & error leaks | `TenantScopedMixin` + `HasOrganizationMembership` filter all querysets by `request.organization` resolved from active `OrganizationMembership`. `HealthCheckView` returns `"unavailable"` without exposing raw DB tracebacks. |
| **Denial of Service** | Unbounded list queries & duplicate webhooks | DRF pagination (`PAGE_SIZE = 25`), `ProviderTransaction` unique constraint on `(organization, provider, provider_reference)` for idempotent webhook retries, and `OrganizationSequence` `SELECT ... FOR UPDATE`. |
| **Elevation of Privilege** | Caretaker/Accountant attempting approvals | `require_org_roles(...)` enforces RBAC boundaries on approvals, rent amendments, lease renewals/terminations, invoice adjustments, payment reversals, and audit logs. |

---

## 2. Access & RBAC Matrix

| Role | Properties / Units / Tenants | Leases (Create) | Lease Amend / Renew / Terminate | Invoices & Payments | Approvals (Adjustments, Reversals, Expenses) | Team & Audit Log | Maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **OWNER** | Read & Write | Yes | Yes | Read & Write | Yes | Read & Write | Read & Write |
| **MANAGER** | Read & Write | Yes | Yes | Read & Write | Yes | Read & Write | Read & Write |
| **ACCOUNTANT** | Read & Write | Yes | No | Read & Write | No (can record expenses, cannot approve/void/reverse) | Read Team only (no member edits, no Audit Log) | Read & Write |
| **CARETAKER** | Read only | No | No | Read only | No | Read Team only (no member edits, no Audit Log) | Read & Write |

Every tenant-scoped request requires a valid `Authorization: Bearer <jwt>` and `X-Organization-ID: <uuid>` matching an `ACTIVE` `OrganizationMembership`.

---

## 3. Upload & File Security Posture

- **MVP Status:** File binary uploads (lease PDFs, receipts, maintenance photos) are deferred from MVP API storage; maintenance requests and provider payloads store validated structured text/JSON only.
- **Pre-Upload Controls (when object storage is introduced):**
  1. Direct-to-S3/R2 pre-signed PUT URLs scoped to `org_id/entity_type/entity_id/` prefixes.
  2. Strict MIME allowlist (`application/pdf`, `image/jpeg`, `image/png`) + magic-byte validation + max file size (`10 MB`).
  3. Serve downloads via short-lived signed URLs with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

---

## 4. Data Retention Schedule

| Record Type | Retention Policy | Rationale |
| --- | --- | --- |
| Financial ledgers (`Invoice`, `InvoiceAdjustment`, `Payment`, `PaymentAllocation`, `PaymentReversal`, `DepositTransaction`, `Expense`) | **Minimum 7 years** (immutable, soft-voided only) | Kenya Revenue Authority (KRA) & statutory accounting audit requirements. |
| Lease agreements & `LeaseEvent` history | **Active term + 7 years** | Contractual dispute resolution and deposit reconciliation traceability. |
| `AuditEvent` & `ProviderTransaction` | **Minimum 7 years** | Financial non-repudiation and M-Pesa reconciliation auditability. |
| Maintenance requests | **Active tenancy + 3 years** | Operational warranty and property upkeep history. |
| Inactive/former tenant PII (`national_id`, personal phone/email) | **Anonymize/purge after retention expiry** when no open balance or statutory hold exists | Data minimization under Kenya Data Protection Act. |

---

## 5. Kenya Data Protection Act (KDPA, 2019) Obligations

1. **Lawful Basis & Notice:** Property managers (Data Controllers) collect tenant `full_name`, `phone`, `email`, and `national_id` solely for tenancy administration, billing, M-Pesa matching, and statutory recordkeeping.
2. **Data Minimization:** Only required tenancy and billing attributes are stored; raw M-Pesa payloads are normalized into `safe_payload` containing transaction references, amount, bill ref, MSISDN, and first name.
3. **Security Safeguards:**
   - TLS/HTTPS required in production (`DJANGO_DEBUG=False` enables `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS=31536000`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `X_FRAME_OPTIONS=DENY`, `SECURE_CONTENT_TYPE_NOSNIFF=True`).
   - Passwords hashed with Django PBKDF2; JWT signing keys >= 32 bytes in production.
   - Multi-tenant database row isolation enforced at every query and serializer boundary.
4. **Data Subject Rights:** Organizations must respond to tenant access, correction (updating contact details while preserving financial ledger attribution), and post-retention erasure/anonymization requests within statutory timelines.
5. **Breach Notification:** Suspected personal data breaches must be contained immediately (rotate `DJANGO_SECRET_KEY` / JWT secrets, revoke compromised memberships), investigated via `AuditEvent`, and reported to the Office of the Data Protection Commissioner (ODPC) within 72 hours where required.
