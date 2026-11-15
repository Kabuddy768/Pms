# ADR 0002: Shared-Schema Multi-Tenancy with Explicit `organization_id`

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
The system must isolate data across multiple landlord/agency organizations while supporting both individual landlords (1-5 units) and agencies (hundreds of units).

## Options Considered
1. **Schema-per-tenant** (`django-tenants`).
2. **Shared PostgreSQL schema** with `organization_id` foreign key on every organization-owned table.

## Decision
Use a **shared PostgreSQL schema** with an explicit `organization_id` UUID column on every tenant-owned table.

## Consequences
- **Positive:** Simple migrations, standard PostgreSQL connection pooling, easy cross-org user memberships, and straightforward backup/restore.
- **Negative:** A missing `.filter(organization=...)` could leak data if not guarded.
- **Mitigations:** `TenantScopedModel` base class, mandatory DRF queryset scoping, same-organization FK validation, and automated cross-tenant negative tests on every endpoint.
- **Revisit Trigger:** Enterprise compliance requirement mandating physical schema/database isolation or PostgreSQL Row-Level Security (RLS) defense-in-depth.
