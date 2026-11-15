# UAT & Production Release Checklist (PMS-082)

## 1. Critical End-to-End UAT Workflows

All critical MVP workflows are covered by automated integration tests (`pytest` under `backend/`) and verified manually across Web (`web/`) and Mobile (`mobile/`):

- [x] **Health & Readiness:** `GET /api/v1/health/` verifies API process and PostgreSQL `SELECT 1` connectivity (`test_health_check_reports_database_ok`).
- [x] **Multi-Tenant Registration & RBAC:** User registration, JWT login/refresh, organization switching via `X-Organization-ID`, last-owner protection, and RBAC guards across `OWNER`, `MANAGER`, `ACCOUNTANT`, and `CARETAKER` (`apps/organizations/test_epic1.py`).
- [x] **Portfolio & Ownership Splits:** Property, building, unit (`unit_code`), unit-cap enforcement, and 100% owner-share validation (`apps/properties/test_epic2.py`).
- [x] **Leasing & Deposits:** Tenant registration, single active lease per unit constraint (`uniq_active_lease_per_unit`), immutable `LeaseEvent` timeline, rent amendments, renewals, and `DepositAccount` / `DepositTransaction` ledger (`apps/leasing/test_epic3.py`).
- [x] **Billing, Payments & M-Pesa Reconciliation:** Sequential `INV-YYYY-XXXX` and `RCPT-YYYY-XXXX` numbering, FIFO allocation, partial payment allocation, idempotent M-Pesa C2B callbacks, Suspense queue assignment, immutable invoice adjustments, and payment reversals (`apps/payments/test_epic4.py`).
- [x] **Expenses, Maintenance & Dashboard Reconciliation:** Expense approval workflow, maintenance triage, and dashboard KPI reconciliation (`apps/reporting/test_epic5.py`).
- [x] **End-to-End MVP Acceptance (Steps 1–9):** Property + 2 units -> tenant + lease -> monthly rent invoice -> partial payment -> explicit allocation + unique receipt -> accurate balance/arrears -> reconciled dashboard -> strict cross-tenant negative isolation (`apps/reporting/test_mvp_e2e.py`).

---

## 2. Pre-Deployment Production Checklist

1. **Secrets & Environment:**
   - [ ] Set `DJANGO_DEBUG=False`.
   - [ ] Set a cryptographically random `DJANGO_SECRET_KEY` (>= 32 bytes; avoids `InsecureKeyLengthWarning`).
   - [ ] Set `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` to exact production domains.
   - [ ] Set `MPESA_CALLBACK_SECRET` (non-empty) so `POST /api/v1/payments/mpesa-callback/` enforces `X-Mpesa-Callback-Secret`.
   - [ ] Point `DATABASE_URL` to managed PostgreSQL with SSL/TLS enabled and daily automated snapshots.
2. **Django & Frontend Build Verification:**
   - [ ] Run `python manage.py check --deploy` with production env vars.
   - [ ] Run `python manage.py migrate --check` after migrations.
   - [ ] Run `cd web && npm run lint && npx tsc --noEmit && npm run build`.
   - [ ] Run `cd mobile && npx tsc --noEmit`.
3. **Database Backup Before Cutover:**
   - [ ] Take a fresh compressed dump via `infra/scripts/backup_db.sh` (or managed DB snapshot) prior to applying schema migrations.

---

## 3. Known MVP Limitations (Deferred Post-MVP)

Per `docs/OPEN_DECISIONS.md`:
- **Live Daraja OAuth & Webhook Signature:** MVP provides an idempotent M-Pesa C2B callback boundary (`MPESA_CALLBACK_SECRET` + `ProviderTransaction` deduplication) ready for live Safaricom Daraja credentials and IP allowlisting in V1.1.
- **Tenant Self-Service Portal:** Tenants do not log in during MVP; invoices and receipts are managed by staff and prepared for SMS/Email adapter delivery.
- **File/Document Binary Storage:** Lease PDFs and maintenance photos are deferred to post-MVP pre-signed object storage.
- **Self-Serve Billing & Late Fees:** Organizations are admin-provisioned (`plan_tier`, `unit_limit`), and automated penalty rules are excluded from V1.

---

## 4. Monitoring & Rollback Plan

### Monitoring
- **Liveness / Readiness:** Poll `GET /api/v1/health/` every 30s (`200 OK` + `{"status": "ok", "database": "ok"}`; `503` alerts on DB unavailability).
- **Financial & Auth Audit Trail:** Inspect `GET /api/v1/audit-events/` and `ProviderTransaction` (`UNMATCHED` Suspense count on `/api/v1/reports/dashboard/`).
- **Application Logs:** Alert on HTTP `5xx` spikes, failed `migrate` jobs, and `403` bursts on `/api/v1/payments/mpesa-callback/`.

### Rollback Plan
1. **Application Rollback (No Breaking Schema Change):**
   - Keep schema migrations backward-compatible (additive columns/tables first; defer destructive drops).
   - Re-deploy previous known-good backend/web release tag and verify `GET /api/v1/health/` returns `200 OK`.
2. **Database Rollback (When Schema/Data Recovery Is Required):**
   - Put backend in maintenance mode (stop API traffic so no split-brain writes occur).
   - Restore the pre-release `.dump` archive into PostgreSQL following `docs/BACKUP_AND_RESTORE.md`.
   - Re-deploy the matching previous application release tag and run smoke checks (`/api/v1/health/`, login, `/api/v1/reports/dashboard/`).
