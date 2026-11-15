# ADR 0003: Authentication & Organization Scoping

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
Both the Next.js Web client and the Expo React Native Mobile client authenticate against the same Django + DRF backend, and a single `User` may belong to multiple organizations with different roles.

## Options Considered
1. Cookie-only session auth (poor fit for React Native mobile).
2. JWT access/refresh tokens (`djangorestframework-simplejwt`) + explicit `X-Organization-ID` request header validated against active `OrganizationMembership`.

## Decision
Use **JWT bearer authentication** (`simplejwt`) for stateless Web & Mobile API access, paired with an explicit **`X-Organization-ID`** header for tenant context.

## Consequences
- **Positive:** Identical auth flow for Web and Mobile; explicit organization switching without re-authenticating; clear audit trail of `(actor_user_id, organization_id)`.
- **Negative:** Client must store/refresh tokens securely and attach `X-Organization-ID` on tenant-scoped requests.
- **Security Rule:** Never trust `X-Organization-ID` alone. Every tenant-scoped view must resolve `OrganizationMembership(user=request.user, organization_id=header_org_id, status='ACTIVE')` and return `403`/`404` otherwise.
- **Revisit Trigger:** Need for SSO/SAML or HTTP-only cookie proxy BFF for web.
