"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  formatKES,
  type DashboardSummary,
  type OrganizationDetail,
} from "@/lib/api";

function OverviewContent({ orgId }: { orgId: string | null }) {
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<OrganizationDetail>("/organizations/current/"),
      apiFetch<DashboardSummary>("/reports/dashboard/"),
    ])
      .then(([orgData, dashData]) => {
        if (!cancelled) {
          setOrg(orgData);
          setDashboard(dashData);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-md p-6">
        <h2 className="text-base font-semibold text-[#0F172A]">No Active Organization</h2>
        <p className="mt-1 text-sm text-[#475569]">
          Use &ldquo;+ New organization&rdquo; in the left rail to create your first
          portfolio workspace.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-md p-4 text-sm text-[#B91C1C]">
        {error}
      </div>
    );
  }

  if (!org || !dashboard) {
    return <div className="text-sm text-[#475569]">Loading portfolio metrics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Financial &amp; Portfolio Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">{org.name}</h1>
        </div>
        <span className="px-2.5 py-1 text-xs font-medium rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
          {org.role}
        </span>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs text-[#64748B]">Occupancy</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {dashboard.occupancy_rate}%
          </div>
          <div className="mt-1 text-xs text-[#475569] tabular-nums">
            {dashboard.occupied_units} occupied / {dashboard.total_units} units
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs text-[#64748B]">Total Billed</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatKES(dashboard.total_billed)}
          </div>
          <div className="mt-1 text-xs text-[#475569]">Non-void issued invoices</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs text-[#64748B]">Total Collected</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#047857]">
            {formatKES(dashboard.total_collected)}
          </div>
          <div className="mt-1 text-xs text-[#475569]">Confirmed receipts</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs text-[#64748B]">Outstanding Arrears</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#B91C1C]">
            {formatKES(dashboard.total_arrears)}
          </div>
          <div className="mt-1 text-xs text-[#475569]">Unpaid invoice balances</div>
        </div>
      </div>

      {/* Secondary Operational Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs text-[#64748B]">Operating Expenses</div>
          <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatKES(dashboard.total_expenses)}
          </div>
          <div className="mt-1 text-xs text-[#475569] tabular-nums">
            Net cashflow: {formatKES(dashboard.net_cashflow)}
          </div>
        </div>

        <Link
          href="/payments"
          className="bg-white border border-[#E2E8F0] hover:border-[#0F5338] rounded-md p-4 block"
        >
          <div className="text-xs text-[#64748B]">Unmatched / Suspense Queue</div>
          <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#B45309]">
            {dashboard.unmatched_suspense_count} payment(s)
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-[#475569]">
            {formatKES(dashboard.unmatched_suspense_amount)} awaiting match
          </div>
        </Link>

        <Link
          href="/maintenance"
          className="bg-white border border-[#E2E8F0] hover:border-[#0F5338] rounded-md p-4 block"
        >
          <div className="text-xs text-[#64748B]">Open Maintenance Tickets</div>
          <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#0F172A]">
            {dashboard.open_maintenance_count}
          </div>
          <div className="mt-1 text-xs text-[#475569]">Open or in-progress</div>
        </Link>
      </div>

      {/* Arrears & Upcoming Lease Expiries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex justify-between items-center">
            <h2 className="text-sm font-semibold text-[#0F172A]">Top Arrears by Lease</h2>
            <Link href="/invoices" className="text-xs text-[#0F5338] hover:underline">
              View Invoices
            </Link>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                <th className="py-2 px-4">Unit</th>
                <th className="py-2 px-4">Tenant</th>
                <th className="py-2 px-4 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {dashboard.arrears_by_lease.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-5 px-4 text-center text-[#64748B]">
                    Zero arrears across the portfolio.
                  </td>
                </tr>
              ) : (
                dashboard.arrears_by_lease.map((row) => (
                  <tr key={row.lease_id}>
                    <td className="py-2 px-4 font-mono font-medium text-[#0F172A]">
                      {row.unit_code}
                    </td>
                    <td className="py-2 px-4 text-[#475569]">{row.tenant_name}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-[#B91C1C] font-medium">
                      {formatKES(row.outstanding_balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex justify-between items-center">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Upcoming Lease Expiries (60 Days)
            </h2>
            <Link href="/leases" className="text-xs text-[#0F5338] hover:underline">
              View Leases
            </Link>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                <th className="py-2 px-4">Unit</th>
                <th className="py-2 px-4">Tenant</th>
                <th className="py-2 px-4">End Date</th>
                <th className="py-2 px-4 text-right">Rent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {dashboard.upcoming_lease_expiries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 px-4 text-center text-[#64748B]">
                    No leases expiring in the next 60 days.
                  </td>
                </tr>
              ) : (
                dashboard.upcoming_lease_expiries.map((row) => (
                  <tr key={row.lease_id}>
                    <td className="py-2 px-4 font-mono font-medium text-[#0F172A]">
                      {row.unit_code}
                    </td>
                    <td className="py-2 px-4 text-[#475569]">{row.tenant_name}</td>
                    <td className="py-2 px-4 font-mono tabular-nums text-[#B45309]">
                      {row.end_date}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums">
                      {formatKES(row.rent_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <OverviewContent orgId={activeMembership?.organization_id || null} />
      )}
    </AppShell>
  );
}
