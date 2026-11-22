"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AttachmentList } from "@/components/AttachmentList";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  formatKES,
  type LeaseItem,
  type PaginatedResponse,
  type PropertyItem,
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
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [ordering, setOrdering] = useState("-start_date");

  const [properties, setProperties] = useState<PropertyItem[]>([]);
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

  // Deposit & amend drawer state
  const [txType, setTxType] = useState<"RECEIVED" | "DEDUCTED" | "REFUNDED">("RECEIVED");
  const [txAmount, setTxAmount] = useState("");
  const [txRef, setTxRef] = useState("");
  const [newRent, setNewRent] = useState("");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (propertyFilter) params.set("unit__property", propertyFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, statusFilter, propertyFilter, ordering]);

  const reloadAll = useCallback(
    async (selectId?: string) => {
      const [leaseRes, unitRes, tenantRes, propRes] = await Promise.all([
        apiFetch<PaginatedResponse<LeaseItem>>(`/leases/${buildQuery()}`),
        apiFetch<PaginatedResponse<UnitItem>>("/units/?status=VACANT&page_size=200"),
        apiFetch<PaginatedResponse<TenantItem>>("/tenants/?page_size=200"),
        apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
      ]);
      setLeases(leaseRes.results);
      setTotalCount(leaseRes.count);
      setVacantUnits(unitRes.results);
      setTenants(tenantRes.results);
      setProperties(propRes.results);
      if (selectId) {
        const updated =
          leaseRes.results.find((l) => l.id === selectId) ||
          (await apiFetch<LeaseItem>(`/leases/${selectId}/`));
        setSelectedLease(updated);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<PaginatedResponse<LeaseItem>>(`/leases/${buildQuery()}`),
      apiFetch<PaginatedResponse<UnitItem>>("/units/?status=VACANT&page_size=200"),
      apiFetch<PaginatedResponse<TenantItem>>("/tenants/?page_size=200"),
      apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
    ])
      .then(([leaseRes, unitRes, tenantRes, propRes]) => {
        if (cancelled) return;
        setLeases(leaseRes.results);
        setTotalCount(leaseRes.count);
        setVacantUnits(unitRes.results);
        setTenants(tenantRes.results);
        setProperties(propRes.results);
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
  }, [orgId, buildQuery]);

  const handleUnitSelect = (id: string) => {
    setUnitId(id);
    const u = vacantUnits.find((item) => item.id === id);
    if (u) {
      setRentAmount(u.advertised_rent);
      setRequiredDeposit(u.advertised_rent);
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
      await reloadAll(created.id);
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
      await reloadAll(selectedLease.id);
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
      await reloadAll(selectedLease.id);
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
      await reloadAll(selectedLease.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not terminate lease");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<LeaseItem>[] = [
    {
      key: "unit",
      header: "Property / Unit",
      render: (l) => (
        <div>
          <div className="font-mono font-medium text-[#0F172A]">{l.unit_code}</div>
          <div className="text-xs text-[#64748B]">{l.property_name}</div>
        </div>
      ),
      csvValue: (l) => `${l.property_name} - ${l.unit_code}`,
    },
    {
      key: "tenant",
      header: "Primary Tenant",
      render: (l) => (
        <span className="text-[#0F172A]">
          {l.occupants.map((o) => o.tenant_name).join(", ") || "—"}
        </span>
      ),
      csvValue: (l) => l.occupants.map((o) => o.tenant_name).join("; "),
    },
    {
      key: "start_date",
      header: "Start Date",
      sortField: "start_date",
      render: (l) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {l.start_date}
        </span>
      ),
      csvValue: (l) => l.start_date,
    },
    {
      key: "rent",
      header: "Monthly Rent",
      align: "right",
      sortField: "rent_amount",
      render: (l) => (
        <span className="font-mono tabular-nums">{formatKES(l.rent_amount)}</span>
      ),
      csvValue: (l) => l.rent_amount,
    },
    {
      key: "deposit",
      header: "Deposit Held",
      align: "right",
      render: (l) => (
        <span className="font-mono tabular-nums text-[#475569]">
          {formatKES(l.deposit_account?.held_balance || "0.00")}
        </span>
      ),
      csvValue: (l) => l.deposit_account?.held_balance || "0.00",
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (l) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            l.status === "ACTIVE"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
          }`}
        >
          {l.status}
        </span>
      ),
      csvValue: (l) => l.status,
    },
  ];

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
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Vacant Unit
            </label>
            <select
              required
              value={unitId}
              onChange={(e) => handleUnitSelect(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Select unit...</option>
              {vacantUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property_name} · {u.unit_code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Primary Tenant
            </label>
            <select
              required
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
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
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Monthly Rent
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Req. Deposit
            </label>
            <input
              type="number"
              step="0.01"
              value={requiredDeposit}
              onChange={(e) => setRequiredDeposit(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={28}
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
              title="Billing day"
              className="w-16 border border-[#CBD5E1] rounded px-2 py-1.5 text-sm font-mono bg-white"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-1.5 px-3 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
            >
              {submitting ? "..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={leases}
        rowKey={(l) => l.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search unit, property, tenant..."
        onSearchChange={(val) => {
          setPage(1);
          setSearch(val);
        }}
        ordering={ordering}
        onOrderingChange={(next) => {
          setPage(1);
          setOrdering(next);
        }}
        filters={
          <>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TERMINATED">Terminated</option>
              <option value="EXPIRED">Expired</option>
            </select>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPage(1);
                setPropertyFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        }
        csvFilename="leases.csv"
        loading={loading}
        emptyMessage="No leases match your filters."
        onRowClick={(l) => setSelectedLease(l)}
        selectedRowKey={selectedLease?.id || null}
      />

      <SlideOver
        open={Boolean(selectedLease)}
        onClose={() => setSelectedLease(null)}
        title={
          selectedLease
            ? `${selectedLease.property_name} · Unit ${selectedLease.unit_code}`
            : "Lease Detail"
        }
        subtitle={
          selectedLease
            ? `${selectedLease.occupants.map((o) => o.tenant_name).join(", ")} · ${
                selectedLease.status
              }`
            : ""
        }
      >
        {selectedLease && (
          <div className="space-y-5 text-xs">
            <div className="border border-[#E2E8F0] rounded p-3 flex justify-between items-center bg-[#F8FAFC]">
              <div>
                <div className="text-[#64748B]">Deposit Held / Required</div>
                <div className="mt-1 font-mono tabular-nums text-sm font-semibold">
                  {formatKES(selectedLease.deposit_account?.held_balance || "0.00")} /{" "}
                  {formatKES(selectedLease.deposit_account?.required_amount || "0.00")}
                </div>
              </div>
              <span className="px-2 py-0.5 font-mono rounded border bg-white border-[#CBD5E1]">
                {selectedLease.deposit_account?.status || "PENDING"}
              </span>
            </div>

            {canWrite && (
              <form
                onSubmit={handleDepositTx}
                className="space-y-2 border border-[#E2E8F0] rounded p-3"
              >
                <div className="font-medium text-[#0F172A]">
                  Record Deposit Transaction
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={txType}
                    onChange={(e) =>
                      setTxType(
                        e.target.value as "RECEIVED" | "DEDUCTED" | "REFUNDED"
                      )
                    }
                    className="border border-[#CBD5E1] rounded px-2 py-1.5 bg-white"
                  >
                    <option value="RECEIVED">RECEIVED</option>
                    {canApprove && <option value="DEDUCTED">DEDUCTED</option>}
                    {canApprove && <option value="REFUNDED">REFUNDED</option>}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Amount"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="border border-[#CBD5E1] rounded px-2 py-1.5 font-mono bg-white"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Reference (e.g. MPESA-DEP-01)"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded px-2 py-1.5 font-mono bg-white"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded"
                >
                  Post Deposit Entry
                </button>
              </form>
            )}

            {canApprove && selectedLease.status === "ACTIVE" && (
              <div className="space-y-3 border border-[#E2E8F0] rounded p-3">
                <form onSubmit={handleAmendRent} className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="New monthly rent"
                    value={newRent}
                    onChange={(e) => setNewRent(e.target.value)}
                    className="flex-1 border border-[#CBD5E1] rounded px-2 py-1.5 font-mono bg-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] rounded font-medium"
                  >
                    Amend Rent
                  </button>
                </form>
                <button
                  type="button"
                  onClick={handleTerminate}
                  className="w-full py-1.5 border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] rounded font-medium"
                >
                  Terminate Lease &amp; Mark Unit Vacant
                </button>
              </div>
            )}

            <div>
              <div className="font-medium text-[#0F172A] mb-2">
                Immutable Lease Events ({selectedLease.events.length})
              </div>
              <div className="border border-[#E2E8F0] rounded divide-y divide-[#E2E8F0]">
                {selectedLease.events.map((ev) => (
                  <div key={ev.id} className="p-2.5 flex justify-between">
                    <span className="font-mono text-[#0F172A]">{ev.event_type}</span>
                    <span className="text-[#64748B] tabular-nums">
                      {new Date(ev.occurred_at).toLocaleDateString("en-KE")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <AttachmentList
              entityType="LEASE"
              entityId={selectedLease.id}
              canWrite={canWrite}
              canDelete={canWrite}
              heading="Signed Lease Documents (URL-Only)"
            />
            <AttachmentList
              entityType="INSPECTION"
              entityId={selectedLease.id}
              canWrite={true}
              canDelete={canWrite}
              heading="Move-In / Move-Out Inspection Photos (URL-Only)"
            />
          </div>
        )}
      </SlideOver>
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
