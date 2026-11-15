# ADR 0004: OpenAPI Contract & Client Codegen Strategy

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
We have two TypeScript clients (`web/` and `mobile/`) consuming one Django REST Framework backend. Hand-writing API types across two frontends leads to drift and runtime bugs.

## Decision
Generate the canonical OpenAPI 3.x schema from DRF using **`drf-spectacular`** and commit/export it as the single source of truth for TypeScript type generation (`openapi-typescript` / typed fetch wrappers) in `web/` and `mobile/`.

## Consequences
- **Positive:** Compile-time type safety across backend and both frontends; automatic Swagger/Redoc API documentation.
- **Negative:** Backend serializers must be cleanly typed/annotated for `drf-spectacular` to emit accurate schemas.
- **Revisit Trigger:** Never—schema-first/generated contracts remain beneficial at all scales.
