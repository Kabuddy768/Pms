"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  buildWhatsAppUrl,
  formatKES,
  type InvoiceItem,
  type PaginatedResponse,
} from "@/lib/api";

function InvoicesContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [ordering, setOrdering] = useState("-issue_date");
  const [selected, setSelected] = useState<InvoiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [period, setPeriod] = useState("2026-11");
  const [generating, setGenerating] = useState(false);

  // Adjustment form inside SlideOver
  const [adjType, setAdjType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (periodFilter) params.set("billing_period", periodFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, statusFilter, periodFilter, ordering]);

  const reload = useCallback(async () => {
    const data = await apiFetch<PaginatedResponse<InvoiceItem>>(
      `/invoices/${buildQuery()}`
    );
    setInvoices(data.results);
    setTotalCount(data.count);
  }, [buildQuery]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    apiFetch<PaginatedResponse<InvoiceItem>>(`/invoices/${buildQuery()}`)
      .then((data) => {
        if (!cancelled) {
          setInvoices(data.results);
          setTotalCount(data.count);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load invoices");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, buildQuery]);

  const handleGenerateMonthly = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch<{ created_count: number; skipped_count: number }>(
        "/invoices/generate-monthly/",
        {
          method: "POST",
          body: JSON.stringify({ billing_period: period }),
        }
      );
      setNotice(
        `Generated ${res.created_count} invoice(s) for ${period} (${res.skipped_count} already billed).`
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoices");
    } finally {
      setGenerating(false);
    }
  };

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError("");
    try {
      const updatedInv = await apiFetch<InvoiceItem>(
        `/invoices/${selected.id}/adjustments/`,
        {
          method: "POST",
          body: JSON.stringify({
            adjustment_type: adjType,
            amount: adjAmount,
            reason: adjReason,
          }),
        }
      );
      setAdjAmount("");
      setAdjReason("");
      setSelected(updatedInv);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue adjustment");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<InvoiceItem>[] = [
    {
      key: "invoice_number",
      header: "Invoice #",
      sortField: "invoice_number",
      render: (inv) => (
        <span className="font-mono text-xs font-medium text-[#0F5338]">
          {inv.invoice_number}
        </span>
      ),
      csvValue: (inv) => inv.invoice_number,
    },
    {
      key: "unit_tenant",
      header: "Unit / Tenant",
      render: (inv) => (
        <div>
          <span className="font-mono text-xs text-[#0F172A]">{inv.unit_code}</span>{" "}
          <span className="text-xs text-[#475569]">· {inv.tenant_name}</span>
        </div>
      ),
      csvValue: (inv) => `${inv.unit_code} - ${inv.tenant_name}`,
    },
    {
      key: "billing_period",
      header: "Period",
      sortField: "billing_period",
      render: (inv) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {inv.billing_period || "—"}
        </span>
      ),
      csvValue: (inv) => inv.billing_period || "",
    },
    {
      key: "due_date",
      header: "Due Date",
      sortField: "due_date",
      render: (inv) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {inv.due_date}
        </span>
      ),
      csvValue: (inv) => inv.due_date,
    },
    {
      key: "total",
      header: "Adjusted Total",
      align: "right",
      sortField: "total_amount",
      render: (inv) => (
        <span className="font-mono tabular-nums">{formatKES(inv.adjusted_total)}</span>
      ),
      csvValue: (inv) => inv.adjusted_total,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (inv) => (
        <span className="font-mono tabular-nums font-medium">
          {formatKES(inv.outstanding_balance)}
        </span>
      ),
      csvValue: (inv) => inv.outstanding_balance,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (inv) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            inv.status === "PAID"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : inv.status === "PARTIAL"
              ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
              : "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
          }`}
        >
          {inv.status}
        </span>
      ),
      csvValue: (inv) => inv.status,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Billing
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Invoices</h1>
        </div>

        {canWrite && (
          <form onSubmit={handleGenerateMonthly} className="flex items-center gap-2">
            <input
              type="month"
              required
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
            <button
              type="submit"
              disabled={generating}
              className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Monthly Rent"}
            </button>
          </form>
        )}
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

      <DataTable
        columns={columns}
        rows={invoices}
        rowKey={(inv) => inv.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search invoice #, unit, tenant..."
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
              <option value="ISSUED">Issued</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
            <input
              type="month"
              value={periodFilter}
              onChange={(e) => {
                setPage(1);
                setPeriodFilter(e.target.value);
              }}
              aria-label="Filter by billing period"
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono bg-white"
            />
            {periodFilter && (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setPeriodFilter("");
                }}
                className="text-xs text-[#64748B] hover:text-[#0F172A]"
              >
                Clear month
              </button>
            )}
          </>
        }
        csvFilename="invoices.csv"
        loading={loading}
        emptyMessage="No invoices match your filters."
        onRowClick={(inv) => setSelected(inv)}
        selectedRowKey={selected?.id || null}
      />

      <SlideOver
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.invoice_number || "Invoice Detail"}
        subtitle={
          selected
            ? `${selected.property_name} · Unit ${selected.unit_code} · ${selected.tenant_name}`
            : ""
        }
      >
        {selected && (
          <div className="space-y-5 text-xs">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/invoices/${selected.id}/print`}
                className="px-3 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded"
              >
                Print / Save PDF
              </Link>
              <a
                href={buildWhatsAppUrl(
                  selected.tenant_phone,
                  `Hello ${selected.tenant_name}, rent invoice ${selected.invoice_number} for Unit ${selected.unit_code} (${selected.property_name}): Balance due ${formatKES(selected.outstanding_balance)} by ${selected.due_date}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-medium rounded"
              >
                Share via WhatsApp
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Adjusted Total</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums">
                  {formatKES(selected.adjusted_total)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Allocated</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#047857]">
                  {formatKES(selected.allocated_amount)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Balance Due</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#B91C1C]">
                  {formatKES(selected.outstanding_balance)}
                </div>
              </div>
            </div>

            <div>
              <div className="font-medium text-[#0F172A] mb-2">Line Items</div>
              <div className="border border-[#E2E8F0] rounded divide-y divide-[#E2E8F0]">
                {selected.lines.map((line) => (
                  <div key={line.id} className="p-2.5 flex justify-between">
                    <span className="text-[#475569]">{line.description}</span>
                    <span className="font-mono tabular-nums">
                      {formatKES(line.line_total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selected.adjustments.length > 0 && (
              <div>
                <div className="font-medium text-[#0F172A] mb-2">
                  Adjustments (Immutable)
                </div>
                <div className="border border-[#E2E8F0] rounded divide-y divide-[#E2E8F0]">
                  {selected.adjustments.map((adj) => (
                    <div key={adj.id} className="p-2.5 flex justify-between">
                      <span>
                        <span className="font-mono font-medium">{adj.adjustment_type}</span>{" "}
                        · {adj.reason}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatKES(adj.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canApprove && selected.status !== "VOID" && (
              <form
                onSubmit={handleAdjustment}
                className="pt-4 border-t border-[#E2E8F0] space-y-3"
              >
                <div className="font-semibold text-[#0F172A]">
                  Issue Credit / Debit Note
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as "CREDIT" | "DEBIT")}
                    className="border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                  >
                    <option value="CREDIT">CREDIT (Reduce)</option>
                    <option value="DEBIT">DEBIT (Add)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Amount"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    className="border border-[#CBD5E1] rounded px-2.5 py-1.5 font-mono bg-white"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Reason (e.g. Repair rebate)"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded"
                >
                  Apply Adjustment
                </button>
              </form>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <InvoicesContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
