# Open Decisions & Approved MVP Policies

**Status:** Approved for MVP implementation. Changes to approved financial, tenancy, or compliance rules require an ADR or explicit stakeholder sign-off.

| ID | Decision | Approved MVP Policy | Status |
| :--- | :--- | :--- | :--- |
| **D-001** | **Initial customer** | Support both **individual landlords** and **property management agencies**. Both are modeled as an `Organization` with one or more `OrganizationMembership` records. | Approved |
| **D-002** | **Property types** | **Residential first for MVP** (simpler lease and tax rules). `property_type` supports `RESIDENTIAL`, `COMMERCIAL`, and `MIXED` on the model so commercial extensions remain non-breaking. | Approved |
| **D-003** | **Tenancy strategy** | **Shared PostgreSQL schema with `organization_id` FK** on every organization-owned table. Cross-tenant isolation is enforced in service/queryset layers and verified with negative tests. | Approved |
| **D-004** | **Lease rules** | Monthly billing cycle by default with configurable due day (e.g., 5th of the month). Full month rent by default, with optional manual proration on move-in. **Strict no-overlap rule:** a unit may have at most **1 `ACTIVE` lease** at a time. | Approved |
| **D-005** | **Late fees** | Optional per property/lease (default: **Off**). When enabled later, supports configurable grace period and fixed or percentage fee. Deferred to fast-follow after core billing. | Approved |
| **D-006** | **Deposits** | Tracked in a dedicated `DEPOSIT_ACCOUNT` and immutable `DEPOSIT_TRANSACTION` ledger per lease (`RECEIVED`, `DEDUCTED`, `REFUNDED`). Never mixed with monthly rent revenue until explicitly applied at move-out. | Approved |
| **D-007** | **Payments** | Support **M-Pesa** (Paybill/Till/STK Push via adapter boundary), **Bank Transfer/Deposit**, **Cash**, and **Cheque**. Include manual/assisted entry with strict duplicate reference protection and an unmatched/suspense queue for C2B typos. | Approved |
| **D-008** | **Allocation** | **Automatic FIFO (oldest unpaid invoice first)** by default, with an option for authorized managers/accountants to manually allocate to specific invoices. | Approved |
| **D-009** | **Overpayments** | Remain as **Unallocated Credit Balance** on the payment/lease and automatically apply to future invoices. Refunds require an explicit authorized reversal/refund record. | Approved |
| **D-010** | **Approvals & Roles** | Four organization roles: `OWNER` (full admin), `MANAGER` (operations, reversals, adjustments, lease amendments), `ACCOUNTANT` (billing, payments, expenses), `CARETAKER` (read portfolio, log maintenance, submit pending payment refs). Reversals and adjustments require `OWNER` or `MANAGER`. | Approved |
| **D-011** | **Ownership** | A property may have one or more `OWNER` records via `PROPERTY_OWNER`. When owners are attached for an active period, `ownership_share` percentages must sum to `100.00%`. | Approved |
| **D-012** | **Tenant access** | **Deferred post-MVP.** Tenants receive invoices and receipts via SMS/Email adapters rather than logging into a self-service portal in V1. | Approved |
| **D-013** | **Communications** | **Email + SMS adapter boundary** (e.g., Africa's Talking / Advanta SMS pattern) for invoice notifications and payment receipts, with consent/opt-out flags on tenant profiles. | Approved |
| **D-014** | **SaaS commercial model** | **Admin-provisioned organizations for MVP.** Store `plan_tier` and `unit_limit` on `ORGANIZATION`; defer self-serve subscription checkout until post-MVP. | Approved |
| **D-015** | **Privacy / Kenya ODPC** | Minimize PII (Name, Phone, Email, optional National ID / KRA PIN masked/protected). Strict tenant isolation, audit logging on sensitive mutations, and data retention controls. | Approved |
