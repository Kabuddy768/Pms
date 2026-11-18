# Phase 2 Master Implementation Plan: Commercial-Grade Multi-Tenant PMS

## 1. Current Baseline — What Is Ready & Live Today (Phase 1 / Epics 0–6)

**Live Deployments:**
- **Web Back-Office:** https://pms-six-theta.vercel.app
- **Django REST API:** https://pms-backend-22wb.onrender.com (`/api/v1/health/`)
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) running PostgreSQL 16 `pytest`, `ruff`, Next.js build, and Expo `tsc` on every push to `main`.

### Completed & Verified Capabilities
| Domain | What Is Ready |
| :--- | :--- |
| **Multi-Tenancy & RBAC** | Shared-schema PostgreSQL isolation (`TenantScopedModel`, `X-Organization-ID`, `HasOrganizationMembership`), 4 roles (`OWNER`, `MANAGER`, `ACCOUNTANT`, `CARETAKER`), direct user provisioning from `/team`, and append-only `AuditEvent` logging. |
| **Portfolio & Ownership** | `Property`, `Building`, `Unit` (`unit_code` for Paybill matching), `Owner`, and `PropertyOwner` with 100.00% equity split validation. |
| **Leasing & Deposits** | `Tenant`, `Lease` (partial unique constraint `uniq_active_lease_per_unit`), `LeaseOccupant`, `LeaseEvent` history, rent amendments/renewals/terminations, and `DepositAccount` / `DepositTransaction` ledger. |
| **Billing & Payments** | Row-locked `OrganizationSequence` (`INV-YYYY-XXXX`, `RCPT-YYYY-XXXX`), monthly batch billing, FIFO allocation, M-Pesa C2B Paybill auto-matching + Suspense queue for unmatched payments, `InvoiceAdjustment`, and `PaymentReversal`. |
| **Operations & Reporting** | `ExpenseCategory`, `Expense` approval workflow, `MaintenanceRequest` triage, reconciled `DashboardSummaryView` (`/api/v1/reports/dashboard/`), Web `/system` readiness view, and Expo Mobile app (`mobile/`). |

---

## 2. Target End-Product Vision (Phase 2)

Transform the Phase 1 CRUD + ledger baseline into a **high-density, automated Kenyan Property Management Operating System**:

1. **Public Architectural Landing Page + Instant Demo Workspace (`/`):**
   - Visitors arriving at `https://pms-six-theta.vercel.app` land on a crisp architectural product showcase (instead of an abrupt `/login` redirect) that wakes the Render API in the background and offers a **1-Click Live Demo** button plus a reserved **Google Sign-In** slot (`D-018`).
2. **High-Density DataTables + Slide-Over Detail Drawers Everywhere (`D-016`):**
   - Replace every basic HTML `<table>` with a unified server-driven `DataTable` supporting debounced search, status/property/period filter pills, column sorting, server-side pagination (eliminating the 25-record ceiling), and 1-click **CSV Export**.
   - Clicking any row opens a **Slide-Over Detail Drawer** (`480px–560px`) for deep workflows: Tenant Running Ledger, Lease Move-Out & Deposit Settlement, Invoice Line-Items & Credit/Debit Notes, and Payment Suspense Assignment.
3. **Database Indexing, Concurrency Hardening & Stress Testing (`D-017`):**
   - Composite `(organization, ...)` indexes on `Invoice`, `Payment`, `Expense`, and `MaintenanceRequest`.
   - Race-proof `SELECT ... FOR UPDATE` and `IntegrityError` handling on `unit_limit` checks, `generate_monthly` invoice batching, and concurrent `mpesa_callback` retries.
4. **Bank & Paybill CSV Statement Reconciliation + Printable PDFs (`D-007`):**
   - No M-Pesa STK Push needed. Instead, accountants upload **M-Pesa Paybill or Bank (Equity/KCB/Co-op/NCBA) CSV statements**, preview *Auto-Matched*, *Duplicate (Skipped)*, and *Unmatched (Suspense)* rows, and reconcile an entire month of payments in seconds.
   - 1-click printable/downloadable **PDF Invoices, Receipts (`RCPT-YYYY-XXXX`), and Tenant Statements** with direct **WhatsApp Share (`wa.me`)** links.
5. **Landlord Owner Payout Statements, KRA MRI Tax Readiness & Water Meter Billing (`D-019`):**
   - Monthly **Owner Remittance Statement** (`Gross Rent Collected − Management Fee % − Approved Expenses = Net Payout × Owner Share %`).
   - **KRA Tax Readiness** (`kra_pin` on Organizations, Owners, and Tenants + **7.5% Monthly Rental Income (MRI) Tax Summary** export) without waiting on slow KRA eTIMS API certification.
   - **Utility / Water Meter Readings** (previous vs. current reading × rate per unit) entered in Web or Mobile and automatically appended as `UTILITY` lines during `generate-monthly` billing.
6. **URL-Based Media Attachments & Playwright E2E Suite (`D-020`):**
   - Store maintenance photos, move-in/move-out inspection photos, expense receipts, and lease PDFs strictly as **external URLs + metadata** (`Attachment` model), never as database blobs.
   - Full **Playwright browser E2E test suite** alongside expanded backend `pytest` concurrency and pagination tests.

---

## 3. Execution Slices (Vertical Slicing Plan)

### Slice 7 — Database Indexing, Concurrency Hardening & Lookup Endpoints
- **Backend:**
  - Add composite `models.Index` definitions on `Invoice` (`(organization, status, due_date)`, `(organization, billing_period)`), `Payment` (`(organization, status, received_at)`, `(organization, lease, status)`), `Expense` (`(organization, status, expense_date)`), and `MaintenanceRequest` (`(organization, status, priority)`).
  - Lock `Organization` (`select_for_update()`) during `Unit` creation to prevent concurrent requests from exceeding `unit_limit`.
  - Harden `InvoiceViewSet.generate_monthly` and `PaymentViewSet.mpesa_callback` with row locks and `IntegrityError` handling so concurrent duplicate calls never return `500`.
  - Allow `?page_size=200` (capped at `200`) on `PageNumberPagination` so reference dropdowns (Units, Tenants, Leases, Properties) never truncate at 25 items.
- **Tests:**
  - Add `backend/apps/core/test_concurrency_and_pagination.py` testing pagination beyond 25 items, `page_size` bounds, idempotent `generate_monthly` / `mpesa_callback` retries, and unit-cap enforcement.

### Slice 8 — Public Landing Page, Workspace Route Split & Google Auth Slot
- **Web (`web/`):**
  - Move the authenticated dashboard overview to `/dashboard` (updating `AppShell` navigation rail) and turn `/` (`web/src/app/page.tsx`) into a crisp, flat architectural **Public Landing Page** following `docs/DESIGN_SYSTEM.md`.
  - Include a silent background `/api/v1/health/` warm-up probe with a live status badge (`API Ready` / `Waking Cloud Server...`), a **1-Click Try Demo Workspace** button (`admin@pms.local`), feature architecture breakdown, and a reserved **Continue with Google** button slot on `/login`.
- **Verification:**
  - `tsc --noEmit`, `eslint`, and production `next build`.

### Slice 9 — Reusable `DataTable`, Slide-Over Detail Drawers & CSV Export
- **Backend:**
  - Add `OrderingFilter` fields and filterset fields across `PropertyViewSet`, `UnitViewSet`, `TenantViewSet`, `LeaseViewSet`, `InvoiceViewSet`, `PaymentViewSet`, `ExpenseViewSet`, `MaintenanceRequestViewSet`, and `AuditEventListView`.
  - Add `GET /api/v1/tenants/{id}/ledger/` returning a chronological running statement of all invoices, adjustments, payments, and balance for a tenant.
- **Web (`web/`):**
  - Create `web/src/components/DataTable.tsx` (search input, filter controls, sortable headers, `Showing X–Y of Z` pagination footer, and client/current-view CSV export) and `web/src/components/SlideOver.tsx`.
  - Upgrade `/properties`, `/tenants`, `/leases`, `/invoices`, `/payments`, `/expenses`, `/maintenance`, and `/audit` to use `DataTable` + `SlideOver` drawers (including the **Tenant Running Ledger Drawer** and **Lease Deposit & Move-Out Drawer**).

### Slice 10 — Bank/Paybill CSV Reconciliation Importer & Printable PDFs / WhatsApp Share
- **Backend:**
  - Add `POST /api/v1/payments/import-csv/` accepting parsed CSV statement rows (`reference`, `amount`, `account_ref`, `phone`, `payer_name`, `method`, `received_at`) with a `dry_run=true/false` mode returning `matched`, `unmatched_suspense`, and `duplicate_skipped` counts + preview rows.
- **Web (`web/`):**
  - Add the **Statement CSV Importer** modal/drawer on `/payments` with live preview before committing.
  - Add a clean **Printable / Save-as-PDF Invoice & Receipt View** (`/invoices/[id]/print` and `/payments/[id]/receipt`) styled with `@media print` and a **Share via WhatsApp (`wa.me`)** action for tenants.
- **Tests:**
  - Backend `pytest` covering dry-run preview, duplicate skipping, unit-code/phone matching, Suspense routing, and cross-tenant isolation.

### Slice 11 — Landlord Owner Payout Statements, KRA MRI Tax Summary & Water Meter Billing
- **Backend:**
  - Add optional `kra_pin` to `Organization`, `Owner`, and `Tenant`; add `management_fee_percent` (`Decimal`, default `10.00%`) to `Property`.
  - Add `UtilityMeterReading` model (`TenantScopedModel`: `unit`, `charge_type`, `billing_period`, `previous_reading`, `current_reading`, `unit_rate`, `total_amount`, `recorded_by`) and automatically include unbilled readings as `InvoiceLine` entries during `generate-monthly`.
  - Add `GET /api/v1/reports/owner-statements/?billing_period=YYYY-MM&property=<id>` and `GET /api/v1/reports/kra-mri-summary/?billing_period=YYYY-MM` (computing gross residential rent collected and 7.5% MRI tax summary).
- **Web & Mobile:**
  - Add `/reports` page in Web for **Owner Remittance Statements** and **KRA 7.5% MRI Tax Summary** (with CSV & print export).
  - Add **Water / Utility Meter Readings** entry in both Web and Mobile (`mobile/`).

### Slice 12 — URL-Based Media Attachments (`Attachment`) & Playwright E2E Suite
- **Backend:**
  - Create `Attachment` model (`TenantScopedModel`: `entity_type` in `MAINTENANCE | LEASE | EXPENSE | INSPECTION`, `entity_id`, `title`, `file_url`, `content_type`, `uploaded_by`) storing external URLs only (`D-020`).
- **Web & Mobile:**
  - Allow attaching and viewing external image/document URLs inside Maintenance, Lease, and Expense drawers (and Mobile maintenance screen).
  - Add **Playwright E2E tests** (`web/e2e/`) verifying Landing Page -> Demo Login -> DataTable search/pagination -> Invoice/Payment workflow -> System Health.
