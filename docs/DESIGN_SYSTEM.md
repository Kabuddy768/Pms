# Design System & UI Standards ("No AI Slop")

This PMS is a **financial and operational back-office system**. Property managers and accountants spend hours working inside ledgers, rent rolls, and reconciliation queues. Clarity, density, and trust come first.

## Visual Rules

1. **Zero Gradients & Zero Glassmorphism:**
   - Do not use decorative gradients (`bg-gradient-to-*`), neon glows, or frosted-glass blurs.
   - Use flat, solid surfaces with crisp `1px` borders.
2. **Color Palette (Neutral Slate + Restrained Forest Accent):**
   - **Canvas Background:** `#F8FAFC` (Slate 50)
   - **Surface / Card:** `#FFFFFF` with `1px solid #E2E8F0` (Slate 200)
   - **Primary Ink:** `#0F172A` (Slate 900)
   - **Secondary / Muted Ink:** `#475569` (Slate 600) and `#64748B` (Slate 500)
   - **Primary Action Accent:** `#0F5338` (Deep Kenyan Forest Green), hover `#0B3F2A`
   - **Semantic Status Colors (Strictly for Financial & Operational State):**
     - **Paid / Active:** `#047857` text on `#ECFDF5` background (`#A7F3D0` border)
     - **Partial / Pending / Due Soon:** `#B45309` text on `#FFFBEB` background (`#FDE68A` border)
     - **Overdue / Arrears / Reversed:** `#B91C1C` text on `#FEF2F2` background (`#FECACA` border)
     - **Draft / Archived / Inactive:** `#475569` text on `#F1F5F9` background (`#CBD5E1` border)
3. **Typography & Financial Alignment:**
   - **UI Font:** `Inter` or system sans-serif.
   - **Monospace / Codes:** `JetBrains Mono` or system monospace for M-Pesa references, unit codes, and invoice numbers.
   - **Tabular Numerals (`tabular-nums`):** Mandatory on all currency (`KES`), percentages, quantities, and dates so financial columns align vertically.
   - **Currency Columns:** Always right-aligned in tables.
4. **Layout & Density:**
   - Fixed left navigation rail (`240px`) with explicit **Organization Switcher** at the top.
   - High-density data tables with sticky headers, explicit loading/empty/error states, and slide-over detail drawers so users never lose their scroll/filter context.
   - No marketing-style hero banners inside authenticated workspace views.

## 5. Standard DataTable Specification (`D-016`)

Every back-office collection view (`Properties`, `Units`, `Tenants`, `Leases`, `Invoices`, `Payments`, `Expenses`, `Maintenance`, `Audit Log`) must use the shared `DataTable` component with:

1. **Unified Toolbar:**
   - Debounced **Search Input** (`300ms`) wired to DRF `?search=`.
   - Contextual **Filter Selects / Pills** (e.g., `status`, `billing_period`, `property`, `method`) wired to DRF query params.
   - Right-aligned **Export CSV** button and primary creation CTA (`+ New ...`).
2. **Column Headers & Sorting:**
   - Background `#F8FAFC`, `12px` (`text-xs`) medium `#475569`, `1px solid #E2E8F0` bottom border.
   - Sortable columns toggle `?ordering=field` / `?ordering=-field` with an explicit directional indicator (`↑` / `↓`).
   - Financial columns (`Rent`, `Total`, `Allocated`, `Balance`, `Amount`) must be `text-right font-mono tabular-nums`.
3. **Server-Side Pagination Footer:**
   - Displays `Showing X–Y of Z records` (`tabular-nums`) with `Previous` / `Next` and page indicator wired to DRF `?page=`.
4. **Slide-Over Detail Drawers (`480px–560px` width):**
   - Clicking a row or its `View / Manage` action opens a right-hand slide-over drawer (`bg-white border-l border-[#E2E8F0]`) for complex actions (e.g., Tenant running ledger, Lease deposit settlement & move-out, Invoice line items & credit/debit adjustments, Suspense payment assignment, Printable Receipt/Invoice preview) instead of cramming inline forms inside table cells.

## 6. Public Landing Page Standards (`D-018`)

- Uses the same restrained architectural aesthetic: `#F8FAFC` canvas, `#FFFFFF` cards, `1px solid #E2E8F0` grid lines, `Inter` + `JetBrains Mono` typography, and `#0F5338` primary accent (zero neon gradients or floating 3D blobs).
- Silently triggers a background `GET /api/v1/health/` probe on mount so cold-started cloud backends wake up before the user clicks **Sign In** or **Try Live Demo**.
- Includes a 1-click **Launch Demo Workspace** action (`admin@pms.local`) alongside standard Login / Register and the reserved **Continue with Google** slot.
