"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  formatKES,
  type PaginatedResponse,
  type TenantItem,
  type TenantLedger,
} from "@/lib/api";

function TenantsContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("full_name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Tenant Running Ledger drawer
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [ledger, setLedger] = useState<TenantLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, statusFilter, ordering]);

  const reload = useCallback(async () => {
    const data = await apiFetch<PaginatedResponse<TenantItem>>(
      `/tenants/${buildQuery()}`
    );
    setTenants(data.results);
    setTotalCount(data.count);
  }, [buildQuery]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    apiFetch<PaginatedResponse<TenantItem>>(`/tenants/${buildQuery()}`)
      .then((data) => {
        if (cancelled) return;
        setTenants(data.results);
        setTotalCount(data.count);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tenants");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, buildQuery]);

  const handleOpenLedger = async (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setLedger(null);
    setLedgerLoading(true);
    try {
      const data = await apiFetch<TenantLedger>(`/tenants/${tenant.id}/ledger/`);
      setLedger(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenant ledger");
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/tenants/", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email,
          national_id: nationalId,
        }),
      });
      setFullName("");
      setPhone("");
      setEmail("");
      setNationalId("");
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add tenant");
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<TenantItem>[] = [
    {
      key: "full_name",
      header: "Tenant",
      sortField: "full_name",
      render: (t) => <span className="font-medium text-[#0F172A]">{t.full_name}</span>,
      csvValue: (t) => t.full_name,
    },
    {
      key: "phone",
      header: "Phone",
      render: (t) => <span className="font-mono text-xs text-[#0F172A]">{t.phone}</span>,
      csvValue: (t) => t.phone,
    },
    {
      key: "email",
      header: "Email",
      render: (t) => <span className="text-[#475569]">{t.email || "—"}</span>,
      csvValue: (t) => t.email || "",
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (t) => (
        <span className="px-2 py-0.5 text-xs font-medium rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
          {t.status}
        </span>
      ),
      csvValue: (t) => t.status,
    },
    {
      key: "ledger",
      header: "Statement",
      align: "right",
      render: () => (
        <span className="text-xs font-medium text-[#0F5338]">View Ledger &rarr;</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Occupancy
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Tenants</h1>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
          >
            {showForm ? "Close" : "+ Add Tenant"}
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Full name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Grace Muthoni"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Phone (M-Pesa)
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254712345678"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="grace@example.com"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              National ID (Optional)
            </label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="12345678"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Tenant"}
          </button>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={tenants}
        rowKey={(t) => t.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search name, phone, email..."
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
            <option value="PAST">Past</option>
          </select>
        }
        csvFilename="tenants.csv"
        loading={loading}
        emptyMessage="No tenants registered yet."
        onRowClick={(t) => void handleOpenLedger(t)}
        selectedRowKey={selectedTenant?.id || null}
      />

      <SlideOver
        open={Boolean(selectedTenant)}
        onClose={() => setSelectedTenant(null)}
        title={selectedTenant?.full_name || "Tenant Ledger"}
        subtitle={`Running Statement · ${selectedTenant?.phone || ""}`}
      >
        {ledgerLoading ? (
          <div className="text-xs text-[#64748B]">Loading running ledger...</div>
        ) : ledger ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[11px] text-[#64748B]">Total Billed</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#0F172A]">
                  {formatKES(ledger.total_billed)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[11px] text-[#64748B]">Total Credited</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#047857]">
                  {formatKES(ledger.total_paid)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[11px] text-[#64748B]">Net Balance</div>
                <div
                  className={`mt-1 text-sm font-mono font-semibold tabular-nums ${
                    Number(ledger.current_balance) > 0
                      ? "text-[#B91C1C]"
                      : "text-[#047857]"
                  }`}
                >
                  {formatKES(ledger.current_balance)}
                </div>
              </div>
            </div>

            <div className="border border-[#E2E8F0] rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Ref / Entry</th>
                    <th className="py-2 px-3 text-right">Debit</th>
                    <th className="py-2 px-3 text-right">Credit</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {ledger.entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-5 px-3 text-center text-[#64748B]">
                        No invoices or payments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    ledger.entries.map((entry, idx) => (
                      <tr key={`${entry.reference}-${idx}`}>
                        <td className="py-2 px-3 font-mono tabular-nums text-[#64748B]">
                          {entry.date}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-mono text-[#0F172A]">{entry.reference}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {entry.unit_code} · {entry.description}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0F172A]">
                          {Number(entry.debit) > 0 ? formatKES(entry.debit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[#047857]">
                          {Number(entry.credit) > 0 ? formatKES(entry.credit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                          {formatKES(entry.running_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#B91C1C]">Could not load ledger.</div>
        )}
      </SlideOver>
    </div>
  );
}

export default function TenantsPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <TenantsContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
