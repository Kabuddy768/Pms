# ADR 0001: Modular Monolith Architecture

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
We are building a multi-tenant Property Management System (PMS) serving Kenyan landlords and property agencies across Web and Mobile clients. The domain includes tightly coupled workflows (leases, invoicing, M-Pesa payment allocations, deposits, and reporting).

## Options Considered
1. **Microservices** (separate services for billing, payments, leasing, auth).
2. **Modular Monolith** (single Django + DRF codebase organized into explicit domain apps with strict service boundaries).

## Decision
Adopt a **Modular Monolith** in Django 5.2 LTS + DRF.

## Consequences
- **Positive:** Single deployment unit, atomic PostgreSQL database transactions across invoices/payments/allocations, simpler local development, and faster vertical slice delivery.
- **Negative:** Requires discipline to avoid circular imports or bypassing domain service boundaries.
- **Revisit Trigger:** Only extract a module (e.g., high-volume M-Pesa webhook ingestion or async reporting) if profiling demonstrates a concrete bottleneck that cannot be solved with background workers.
