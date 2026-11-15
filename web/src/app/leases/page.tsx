"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  formatKES,
  type LeaseItem,
  type PaginatedResponse,
  type TenantItem,
  type UnitItem,
} from "@/lib/api";

function LeasesContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [vacantUnits, setVacantUnits] = useState<UnitItem[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedLease, setSelectedLease] = useState<LeaseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Create form state
  const [unitId, setUnitId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [startDate, setStartDate] = useState("2026-11-01");
  const [rentAmount, setRentAmount] = useState("");
  const [requiredDeposit, setRequiredDeposit] = useState("");
  const [billingDay, setBillingDay] = useState("5");
  const [submitting, setSubmitting] = useState(false);

  // Deposit drawer form state
  const [txType, setTxType] = useState<"RECEIVED" | "DEDUCTED" | "REFUNDED">("RECEIVED");
  const [txAmount, setTxAmount] = useState("");
  const [txRef, setTxRef] = useState("");
  const [newRent, setNewRent] = useState("");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const loadAll = async () => {
    const [leaseRes, unitRes, tenantRes] = await Promise.all([
      apiFetch<PaginatedResponse<LeaseItem>>("/leases/"),
      apiFetch<PaginatedResponse<UnitItem>>("/units/?status=VACANT"),
      apiFetch<PaginatedResponse<TenantItem>>("/tenants/"),
    ]);
    return {
      leases: leaseRes.results,
      units: unitRes.results,
      tenants: tenantRes.results,
    };
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    loadAll()
      .then((res) => {
        if (cancelled) return;
        setLeases(res.leases);
        setVacantUnits(res.units);
        setTenants(res.tenants);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load leases");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleUnitSelect = (id: string) => {
    setUnitId(id);
    const u = vacantUnits.find((item) => item.id === id);
    if (u) {
      setRentAmount(u.advertised_rent);
      setRequiredDeposit(u.advertised_rent);
    }
  };

  const refreshAndSelect = async (leaseId?: string) => {
    const res = await loadAll();
    setLeases(res.leases);
    setVacantUnits(res.units);
    setTenants(res.tenants);
    if (leaseId) {
      const updated = res.leases.find((l) => l.id === leaseId) || null;
      setSelectedLease(updated);
    }
  };

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await apiFetch<LeaseItem>("/leases/", {
        method: "POST",
        body: JSON.stringify({
          unit: unitId,
          start_date: startDate,
          rent_amount: rentAmount,
          required_deposit: requiredDeposit || "0.00",
          billing_day: Number(billingDay),
          occupants: [{ tenant: tenantId, occupant_role: "PRIMARY" }],
        }),
      });
      setShowForm(false);
      setUnitId("");
      setTenantId("");
      await refreshAndSelect(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create lease");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLease) return;
    setError("");
    try {
      await apiFetch(`/leases/${selectedLease.id}/deposit-transactions/`, {
        method: "POST",
        body: JSON.stringify({
          transaction_type: txType,
          amount: txAmount,
          reference: txRef,
        }),
      });
      setTxAmount("");
      setTxRef("");
      await refreshAndSelect(selectedLease.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit transaction failed");
    }
  };

  const handleAmendRent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLease || !newRent) return;
    setError("");
    try {
      await apiFetch(`/leases/${selectedLease.id}/amend-rent/`, {
        method: "POST",
        body: JSON.stringify({ rent_amount: newRent, reason: "Rent adjustment" }),
      });
      setNewRent("");
      await refreshAndSelect(selectedLease.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not amend rent");
    }
  };

  const handleTerminate = async () => {
    if (!selectedLease) return;
    setError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      await apiFetch(`/leases/${selectedLease.id}/terminate/`, {
        method: "POST",
        body: JSON.stringify({ end_date: today, reason: "Lease terminated" }),
      });
      await refreshAndSelect(selectedLease.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not terminate lease");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Occupancy &amp; Deposits
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Leases</h1>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
          >
            {showForm ? "Close" : "+ New Lease"}
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <form
          onSubmit={handleCreateLease}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Vacant Unit
            </label>
            <select
              required
              value={unitId}
              onChange={(e) => handleUnitSelect(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Select vacant unit...</option>
              {vacantUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property_name} — {u.unit_code} ({formatKES(u.advertised_rent)})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Primary Tenant
            </label>
            <select
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.phone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Start Date
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Due Day (1–28)
            </label>
            <input
              type="number"
              min={1}
              max={28}
              required
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums bg-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Monthly Rent (KES)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums bg-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Required Deposit (KES)
            </label>
            <input
              type="number"
              step="0.01"
              value={requiredDeposit}
              onChange={(e) => setRequiredDeposit(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums bg-white"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Active Lease"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
                <th className="py-2.5 px-4">Unit</th>
                <th className="py-2.5 px-4">Tenant</th>
                <th className="py-2.5 px-4 text-right">Monthly Rent</th>
                <th className="py-2.5 px-4 text-right">Deposit Held</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                    Loading leases...
                  </td>
                </tr>
              ) : leases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-[#64748B]">
                    No leases created yet.
                  </td>
                </tr>
              ) : (
                leases.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedLease(l)}
                    className={`cursor-pointer hover:bg-[#F8FAFC] ${
                      selectedLease?.id === l.id ? "bg-[#F1F5F9]" : ""
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-mono font-medium text-[#0F172A]">
                        {l.unit_code}
                      </div>
                      <div className="text-xs text-[#64748B]">{l.property_name}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[#0F172A]">
                      {l.occupants[0]?.tenant_name || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {formatKES(l.rent_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#475569]">
                      {l.deposit_account
                        ? formatKES(l.deposit_account.held_balance)
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${
                          l.status === "ACTIVE"
                            ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                            : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Right-hand Lease & Deposit Inspector */}
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4 space-y-4">
          {!selectedLease ? (
            <div className="text-xs text-[#64748B]">
              Select a lease row to inspect deposit ledger, amend rent, or view lease
              events.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3">
                <div>
                  <div className="text-xs font-mono text-[#64748B]">
                    {selectedLease.property_name} • {selectedLease.unit_code}
                  </div>
                  <div className="text-base font-semibold text-[#0F172A]">
                    {selectedLease.occupants[0]?.tenant_name || "Lease"}
                  </div>
                </div>
                {canApprove && selectedLease.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={handleTerminate}
                    className="px-2.5 py-1 text-xs font-medium border border-[#FECACA] text-[#B91C1C] bg-[#FEF2F2] rounded"
                  >
                    Terminate
                  </button>
                )}
              </div>

              {/* Deposit Ledger */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#0F172A]">Deposit Ledger</span>
                  <span className="font-mono tabular-nums text-[#475569]">
                    Held:{" "}
                    {selectedLease.deposit_account
                      ? formatKES(selectedLease.deposit_account.held_balance)
                      : "KES 0.00"}{" "}
                    /{" "}
                    {selectedLease.deposit_account
                      ? formatKES(selectedLease.deposit_account.required_amount)
                      : "KES 0.00"}
                  </span>
                </div>

                {canWrite && (
                  <form onSubmit={handleDepositTx} className="grid grid-cols-3 gap-2">
                    <select
                      value={txType}
                      onChange={(e) =>
                        setTxType(
                          e.target.value as "RECEIVED" | "DEDUCTED" | "REFUNDED"
                        )
                      }
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs bg-white"
                    >
                      <option value="RECEIVED">Received</option>
                      {canApprove && <option value="DEDUCTED">Deducted</option>}
                      {canApprove && <option value="REFUNDED">Refunded</option>}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Amount"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="text"
                      placeholder="M-Pesa Ref"
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs font-mono"
                    />
                    <button
                      type="submit"
                      className="col-span-3 py-1 text-xs font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
                    >
                      Record Deposit Entry
                    </button>
                  </form>
                )}
              </div>

              {/* Amend Rent */}
              {canApprove && selectedLease.status === "ACTIVE" && (
                <form
                  onSubmit={handleAmendRent}
                  className="pt-2 border-t border-[#E2E8F0] flex gap-2"
                >
                  <input
                    type="number"
                    step="0.01"
                    placeholder="New rent (KES)"
                    value={newRent}
                    onChange={(e) => setNewRent(e.target.value)}
                    className="flex-1 border border-[#CBD5E1] rounded px-2.5 py-1 text-xs font-mono tabular-nums"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-medium border border-[#CBD5E1] rounded hover:bg-[#F8FAFC]"
                  >
                    Amend Rent
                  </button>
                </form>
              )}

              {/* Event History */}
              <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                <div className="text-xs font-semibold text-[#0F172A]">Lease History</div>
                {selectedLease.events.map((ev) => (
                  <div key={ev.id} className="text-xs flex justify-between text-[#475569]">
                    <span className="font-mono text-[#0F172A]">{ev.event_type}</span>
                    <span className="font-mono tabular-nums">
                      {new Date(ev.occurred_at).toLocaleDateString("en-KE")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeasesPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <LeasesContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
