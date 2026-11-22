"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  formatKES,
  type KraMriSummaryResponse,
  type OwnerStatementResponse,
} from "@/lib/api";

function ReportsContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [period, setPeriod] = useState("2026-11");
  const [statements, setStatements] = useState<OwnerStatementResponse | null>(null);
  const [kraSummary, setKraSummary] = useState<KraMriSummaryResponse | null>(null);
  const [kraPinInput, setKraPinInput] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canManageOrg = role === "OWNER" || role === "MANAGER";

  const reloadReports = useCallback(async () => {
    const [stmtRes, kraRes] = await Promise.all([
      apiFetch<OwnerStatementResponse>(
        `/reports/owner-statements/?billing_period=${encodeURIComponent(period)}`
      ),
      apiFetch<KraMriSummaryResponse>(
        `/reports/kra-mri-summary/?billing_period=${encodeURIComponent(period)}`
      ),
    ]);
    setStatements(stmtRes);
    setKraSummary(kraRes);
    setKraPinInput(stmtRes.organization_kra_pin || "");
  }, [period]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<OwnerStatementResponse>(
        `/reports/owner-statements/?billing_period=${encodeURIComponent(period)}`
      ),
      apiFetch<KraMriSummaryResponse>(
        `/reports/kra-mri-summary/?billing_period=${encodeURIComponent(period)}`
      ),
    ])
      .then(([stmtRes, kraRes]) => {
        if (cancelled) return;
        setStatements(stmtRes);
        setKraSummary(kraRes);
        setKraPinInput(stmtRes.organization_kra_pin || "");
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load reports");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, period]);

  const handleSaveKraPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPin(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/organizations/current/", {
        method: "PATCH",
        body: JSON.stringify({ kra_pin: kraPinInput.trim().toUpperCase() }),
      });
      await reloadReports();
      setNotice("Organization KRA PIN saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update KRA PIN");
    } finally {
      setSavingPin(false);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4 print:border-0">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Financial &amp; Statutory Reports
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
            Owner Payouts &amp; KRA 7.5% MRI Tax Summary
          </h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded text-xs text-[#047857]">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#475569]">Generating financial statements...</div>
      ) : (
        <>
          {/* KRA 7.5% Monthly Rental Income (MRI) Summary */}
          {kraSummary && (
            <section className="bg-white border border-[#E2E8F0] rounded-md p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[#0F5338]">
                    KRA Tax Readiness (Residential MRI · {kraSummary.mri_tax_rate}%)
                  </div>
                  <h2 className="mt-0.5 text-base font-semibold text-[#0F172A]">
                    {kraSummary.organization_name} · Period {kraSummary.billing_period}
                  </h2>
                </div>

                {canManageOrg && (
                  <form
                    onSubmit={handleSaveKraPin}
                    className="flex items-center gap-2 print:hidden"
                  >
                    <input
                      type="text"
                      value={kraPinInput}
                      onChange={(e) => setKraPinInput(e.target.value)}
                      placeholder="Org KRA PIN (e.g. P051...)"
                      className="border border-[#CBD5E1] rounded px-2.5 py-1 text-xs font-mono uppercase bg-white"
                    />
                    <button
                      type="submit"
                      disabled={savingPin}
                      className="px-3 py-1 border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-medium rounded"
                    >
                      {savingPin ? "Saving..." : "Save PIN"}
                    </button>
                  </form>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-xs text-[#64748B]">
                    Residential Rent Collected
                  </div>
                  <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#0F172A]">
                    {formatKES(kraSummary.gross_residential_collected)}
                  </div>
                </div>
                <div className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-xs text-[#64748B]">
                    Estimated KRA MRI (7.5%)
                  </div>
                  <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#B45309]">
                    {formatKES(kraSummary.estimated_mri_tax)}
                  </div>
                </div>
                <div className="border border-[#E2E8F0] rounded p-3">
                  <div className="text-xs text-[#64748B]">
                    Commercial / Mixed (Non-MRI)
                  </div>
                  <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#475569]">
                    {formatKES(kraSummary.gross_commercial_or_mixed_collected)}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Owner Payout Remittance Statements */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Property Owner Remittance Statements ({statements?.billing_period})
            </h2>

            {!statements || statements.statements.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-md p-6 text-sm text-[#64748B]">
                No properties found for this period.
              </div>
            ) : (
              statements.statements.map((stmt) => (
                <div
                  key={stmt.property_id}
                  className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <div className="font-semibold text-sm text-[#0F172A]">
                        {stmt.property_name}
                      </div>
                      <div className="text-[11px] font-mono text-[#64748B]">
                        {stmt.property_type} · Agency Fee {stmt.management_fee_percent}%
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs font-mono tabular-nums">
                      <span>Gross: {formatKES(stmt.gross_collected)}</span>
                      <span className="text-[#475569]">
                        Fee: -{formatKES(stmt.management_fee_amount)}
                      </span>
                      <span className="text-[#B91C1C]">
                        Expenses: -{formatKES(stmt.approved_expenses)}
                      </span>
                      <span className="font-semibold text-[#0F5338]">
                        Net Payout: {formatKES(stmt.net_remittance)}
                      </span>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[#475569]">
                        <th className="py-2 px-4">Beneficial Owner</th>
                        <th className="py-2 px-4">KRA PIN</th>
                        <th className="py-2 px-4 text-right">Share %</th>
                        <th className="py-2 px-4 text-right">Net Remittance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {stmt.owners.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 px-4 text-[#64748B]">
                            No owners linked on this property yet.
                          </td>
                        </tr>
                      ) : (
                        stmt.owners.map((own) => (
                          <tr key={own.owner_id}>
                            <td className="py-2 px-4 font-medium text-[#0F172A]">
                              {own.full_name}
                            </td>
                            <td className="py-2 px-4 font-mono text-[#64748B]">
                              {own.kra_pin || "—"}
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums">
                              {own.ownership_share}%
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-[#047857]">
                              {formatKES(own.payout_amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <ReportsContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
