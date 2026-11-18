"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  DEMO_CREDENTIALS,
  getAccessToken,
  loginWithCredentials,
  type HealthCheckResponse,
} from "@/lib/api";

const PILLARS = [
  {
    code: "01 // TENANCY",
    title: "Multi-Tenant Isolation",
    description:
      "Shared PostgreSQL architecture scoped strictly by organization membership, with OWNER, MANAGER, ACCOUNTANT, and CARETAKER roles.",
  },
  {
    code: "02 // RECONCILIATION",
    title: "M-Pesa Paybill & Bank Matching",
    description:
      "Auto-matches incoming C2B references to unit codes and tenant phones, routing typos into an explicit Suspense Queue without losing funds.",
  },
  {
    code: "03 // LEDGERS",
    title: "Immutable Financial Accounting",
    description:
      "Exact Decimal(14,2) arithmetic, sequential INV/RCPT numbering, FIFO allocations, Credit/Debit adjustments, and non-destructive reversals.",
  },
  {
    code: "04 // PORTFOLIO",
    title: "Properties, Units & Equity Splits",
    description:
      "Track buildings, unit codes, and multi-owner portfolios with enforced 100.00% ownership share validation and unit-cap enforcement.",
  },
  {
    code: "05 // OPERATIONS",
    title: "Leases, Deposits & Maintenance",
    description:
      "Strict single-active-lease-per-unit guard, dedicated DepositAccount ledgers, expense approvals, and Web + Expo Mobile workflows.",
  },
  {
    code: "06 // AUDIT & TAX",
    title: "Audit Trail & KRA Readiness",
    description:
      "Append-only AuditEvent tracking across every financial and tenancy action, database health probes, and verified backup/restore scripts.",
  },
];

const SAMPLE_LEDGER_ROWS = [
  { ref: "INV-2026-0041", unit: "KC-101", detail: "Monthly Rent · 2026-11", amount: "KES 45,000.00", tone: "text-[#0F172A]" },
  { ref: "RCPT-2026-0018", unit: "KC-101", detail: "M-Pesa Paybill · MPESA-TX92A", amount: "-KES 30,000.00", tone: "text-[#047857]" },
  { ref: "BAL-DUE", unit: "KC-101", detail: "Remaining Open Balance", amount: "KES 15,000.00", tone: "text-[#B45309]" },
];

export default function LandingPage() {
  const router = useRouter();
  const [apiState, setApiState] = useState<"waking" | "online" | "offline">("waking");
  const [hasSession, setHasSession] = useState(false);
  const [launchingDemo, setLaunchingDemo] = useState(false);
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Background health probe wakes cold-started Render instances before login
    apiFetch<HealthCheckResponse>("/health/", { includeOrg: false })
      .then((res) => {
        if (cancelled) return;
        setHasSession(Boolean(getAccessToken()));
        setApiState(res.status === "ok" ? "online" : "offline");
      })
      .catch(() => {
        if (cancelled) return;
        setHasSession(Boolean(getAccessToken()));
        setApiState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLaunchDemo = async () => {
    setDemoError("");
    setLaunchingDemo(true);
    try {
      await loginWithCredentials(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      router.push("/dashboard");
    } catch (err) {
      setDemoError(
        err instanceof Error
          ? err.message
          : "Could not sign into demo workspace. Try manual sign in."
      );
      setLaunchingDemo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#0F5338]" />
            <span className="font-semibold text-sm tracking-tight text-[#0F172A]">
              PMS
            </span>
            <span className="hidden sm:inline text-xs font-mono text-[#64748B]">
              {"// Property Operating System"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded border ${
                apiState === "online"
                  ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                  : apiState === "waking"
                  ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
                  : "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
              }`}
            >
              {apiState === "online"
                ? "API ONLINE · DB OK"
                : apiState === "waking"
                ? "WAKING API SERVER..."
                : "API UNREACHABLE"}
            </span>

            {hasSession ? (
              <Link
                href="/dashboard"
                className="px-3.5 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded"
              >
                Open Workspace
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-medium rounded"
                >
                  Sign In
                </Link>
                <button
                  type="button"
                  onClick={handleLaunchDemo}
                  disabled={launchingDemo}
                  className="px-3.5 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded disabled:opacity-50"
                >
                  {launchingDemo ? "Starting Demo..." : "Try Live Demo"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-block px-2.5 py-1 bg-white border border-[#E2E8F0] rounded text-[11px] font-mono uppercase tracking-wider text-[#0F5338]">
              Multi-Tenant SaaS · Kenyan Real Estate Operations
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#0F172A] leading-tight">
              Financial-grade rent ledgers and M-Pesa reconciliation for landlords and agencies.
            </h1>
            <p className="text-base text-[#475569] leading-relaxed max-w-2xl">
              Replace fragile spreadsheets with strict tenant isolation, Paybill &amp; bank
              reconciliation, immutable invoice and deposit ledgers, and real-time portfolio
              reporting across Web and Expo Mobile.
            </p>

            {demoError && (
              <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
                {demoError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={launchingDemo}
                className="px-5 py-2.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
              >
                {launchingDemo ? "Launching Demo Workspace..." : "Launch Demo Workspace"}
              </button>
              <Link
                href="/login?mode=register"
                className="px-5 py-2.5 border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-sm font-medium rounded"
              >
                Create Organization
              </Link>
              <Link
                href="/login"
                className="px-3 py-2.5 text-sm font-medium text-[#475569] hover:text-[#0F5338]"
              >
                Sign in with email &rarr;
              </Link>
            </div>

            <div className="pt-2 text-xs font-mono text-[#64748B] tabular-nums">
              Demo credentials: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
            </div>
          </div>

          {/* Architectural Ledger Snapshot */}
          <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#475569]">
                Ledger &amp; Reconciliation Snapshot
              </span>
              <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
                NUMERIC(14,2)
              </span>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-[11px] text-[#64748B]">Active Org Scope</div>
                  <div className="mt-1 text-xs font-mono font-medium text-[#0F172A]">
                    Kilimani Estates
                  </div>
                </div>
                <div className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-[11px] text-[#64748B]">Suspense Queue</div>
                  <div className="mt-1 text-xs font-mono font-medium text-[#B45309] tabular-nums">
                    Auto-match + Review
                  </div>
                </div>
              </div>

              <div className="border border-[#E2E8F0] rounded overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <th className="py-2 px-3">Ref</th>
                      <th className="py-2 px-3">Entry</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {SAMPLE_LEDGER_ROWS.map((row) => (
                      <tr key={row.ref}>
                        <td className="py-2 px-3 font-mono text-[#0F172A]">{row.ref}</td>
                        <td className="py-2 px-3 text-[#475569]">{row.detail}</td>
                        <td
                          className={`py-2 px-3 text-right font-mono tabular-nums font-medium ${row.tone}`}
                        >
                          {row.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] pt-1">
                <span>FIFO Allocation · Locked Sequence</span>
                <span>Audit Logged</span>
              </div>
            </div>
          </div>
        </section>

        {/* System Pillars Grid */}
        <section className="border-t border-[#E2E8F0] bg-white py-12">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-8">
              <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
                Architecture &amp; Capabilities
              </div>
              <h2 className="mt-1 text-2xl font-semibold text-[#0F172A]">
                Built as a modular financial system, not a spreadsheet wrapper
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PILLARS.map((item) => (
                <div
                  key={item.code}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md p-5"
                >
                  <div className="text-[11px] font-mono text-[#0F5338]">{item.code}</div>
                  <h3 className="mt-1.5 text-sm font-semibold text-[#0F172A]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#475569] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-[#F8FAFC] py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#64748B]">
          <div>PMS · Multi-Tenant Property Management System</div>
          <div className="flex items-center gap-4 font-mono">
            <Link href="/login" className="hover:text-[#0F5338]">
              Sign In
            </Link>
            <Link href="/login?mode=register" className="hover:text-[#0F5338]">
              Register
            </Link>
            <Link href="/dashboard" className="hover:text-[#0F5338]">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
