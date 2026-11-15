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
