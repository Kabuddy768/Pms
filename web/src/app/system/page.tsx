"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  type HealthCheckResponse,
  type OrganizationDetail,
} from "@/lib/api";

const READINESS_CONTROLS = [
  {
    area: "Tenant Isolation",
    control: "TenantScopedModel + X-Organization-ID active OrganizationMembership",
    reference: "docs/SECURITY_AND_PRIVACY.md",
  },
  {
    area: "Financial Precision & Ledgers",
    control: "Decimal NUMERIC(14,2) arithmetic & append-only reversals/adjustments",
    reference: "docs/OPEN_DECISIONS.md",
  },
  {
    area: "M-Pesa Callback Guard",
    control: "Idempotent ProviderTransaction deduplication + optional shared secret header",
    reference: "docs/SECURITY_AND_PRIVACY.md",
  },
  {
    area: "Backup & Recovery",
    control: "Compressed pg_dump backups & tested restore into non-prod PostgreSQL",
    reference: "docs/BACKUP_AND_RESTORE.md",
  },
  {
    area: "UAT & Rollback",
    control: "End-to-end MVP acceptance suite & documented rollback plan",
    reference: "docs/RELEASE_CHECKLIST.md",
  },
];

function SystemReadinessContent({ orgId }: { orgId: string | null }) {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<string>("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<HealthCheckResponse>("/health/", { includeOrg: false }),
      orgId
        ? apiFetch<OrganizationDetail>("/organizations/current/")
        : Promise.resolve(null),
    ])
      .then(([h, org]) => {
        if (cancelled) return;
        setHealth(h);
        setOrgDetail(org);
        setError("");
        setLastChecked(new Date().toLocaleTimeString());
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to inspect system health");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, refreshTick]);

  const handleRefresh = () => {
    setLoading(true);
    setError("");
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Release Readiness
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
            System Health &amp; Organization Config
          </h1>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-50"
        >
          {loading ? "Checking..." : "Refresh Probe"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs font-medium text-[#64748B]">API Service</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-mono rounded ${
                health?.status === "ok"
                  ? "bg-[#ECFDF5] text-[#0F5338] border border-[#A7F3D0]"
                  : "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
              }`}
            >
              {health ? health.status.toUpperCase() : loading ? "CHECKING" : "UNKNOWN"}
            </span>
            <span className="text-xs font-mono text-[#475569]">
              {health?.service || "pms-backend"}
            </span>
          </div>
          {lastChecked && (
            <div className="mt-2 text-[11px] font-mono text-[#64748B] tabular-nums">
              Last probed: {lastChecked}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs font-medium text-[#64748B]">Database Connectivity</div>
          <div className="mt-2">
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-mono rounded ${
                health?.database === "ok"
                  ? "bg-[#ECFDF5] text-[#0F5338] border border-[#A7F3D0]"
                  : "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
              }`}
            >
              {health ? `DB ${health.database.toUpperCase()}` : "CHECKING"}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[#64748B]">
            Verified via GET /api/v1/health/ (SELECT 1)
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4">
          <div className="text-xs font-medium text-[#64748B]">Organization Policy</div>
          {orgDetail ? (
            <div className="mt-2 space-y-1 text-xs text-[#0F172A]">
              <div className="font-medium">{orgDetail.name}</div>
              <div className="font-mono text-[#475569] tabular-nums">
                {orgDetail.default_currency} · {orgDetail.timezone}
              </div>
              <div className="font-mono text-[#64748B] tabular-nums">
                Tier: {orgDetail.plan_tier} · Unit cap: {orgDetail.unit_limit}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-[#64748B]">No active organization selected.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            MVP Release Readiness Controls
          </h2>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Area</th>
              <th className="py-2.5 px-4">Control</th>
              <th className="py-2.5 px-4">Documentation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {READINESS_CONTROLS.map((item) => (
              <tr key={item.area} className="hover:bg-[#F8FAFC]">
                <td className="py-2.5 px-4 font-medium text-[#0F172A]">{item.area}</td>
                <td className="py-2.5 px-4 text-[#475569]">{item.control}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-[#0F5338]">
                  {item.reference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SystemPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <SystemReadinessContent orgId={activeMembership?.organization_id || null} />
      )}
    </AppShell>
  );
}
