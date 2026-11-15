# PMS Repository Guidelines (`AGENTS.md`)

## Architecture & Vertical Slicing
- This repository is a **modular monolith** (`backend/` Django 5.2 + DRF, `web/` Next.js + TypeScript, `mobile/` Expo + TypeScript).
- Work in **vertical slices**: each slice delivers backend models/services/API + tests + UI together.
- Do not infer or alter approved business policies in `docs/OPEN_DECISIONS.md` without updating the decision log.

## Non-Negotiable Engineering Rules
1. **Tenant Isolation:** Every organization-owned model must inherit from `TenantScopedModel` (with explicit `organization_id`). Every API view must scope querysets by the authenticated user's active `OrganizationMembership`. Every module must include cross-tenant negative tests.
2. **Money Arithmetic:** Always use `Decimal` (`NUMERIC(14, 2)`). Never use `float` for currency, rent, allocations, or deposits.
3. **Immutable Ledgers:** Never delete or silently mutate issued invoices, completed payments, or lease history. Use `INVOICE_ADJUSTMENT`, `PAYMENT_REVERSAL`, `DEPOSIT_TRANSACTION`, and `LEASE_EVENT`.
4. **UI Standards ("No AI Slop"):** Follow `docs/DESIGN_SYSTEM.md` strictly. No decorative gradients, no glassmorphism, flat slate/white surfaces, `#0F5338` primary accent, and `tabular-nums` for all financial figures.
5. **Validation:** Run backend tests (`pytest`) and frontend typecheck/lint before completing any slice.
