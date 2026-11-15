"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
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
  const [selected, setSelected] = useState<InvoiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [period, setPeriod] = useState("2026-11");
  const [generating, setGenerating] = useState(false);

  // Adjustment form
  const [adjType, setAdjType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const fetchInvoices = async () => {
    const data = await apiFetch<PaginatedResponse<InvoiceItem>>("/invoices/");
    return data.results;
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchInvoices()
      .then((results) => {
        if (!cancelled) {
          setInvoices(results);
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
  }, [orgId]);

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
      const updated = await fetchInvoices();
      setInvoices(updated);
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
      setInvoices(await fetchInvoices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue adjustment");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-4">Unit / Tenant</th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4 text-right">Total</th>
                <th className="py-2.5 px-4 text-right">Balance</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-[#64748B]">
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-[#64748B]">
                    No invoices issued yet. Use &ldquo;Generate Monthly Rent&rdquo; above.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    className={`cursor-pointer hover:bg-[#F8FAFC] ${
                      selected?.id === inv.id ? "bg-[#F1F5F9]" : ""
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-[#0F172A]">
                      {inv.invoice_number}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#0F172A]">
                        {inv.unit_code} • {inv.tenant_name}
                      </div>
                      <div className="text-xs text-[#64748B]">{inv.property_name}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-[#475569] tabular-nums">
                      {inv.due_date}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#0F172A]">
                      {formatKES(inv.adjusted_total)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#0F172A]">
                      {formatKES(inv.outstanding_balance)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${
                          inv.status === "PAID"
                            ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                            : inv.status === "PARTIAL"
                            ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
                            : inv.status === "ISSUED"
                            ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
                            : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Invoice Inspector Drawer */}
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4 space-y-4">
          {!selected ? (
            <div className="text-xs text-[#64748B]">
              Select an invoice row to inspect line items or issue a credit/debit note.
            </div>
          ) : (
            <>
              <div className="border-b border-[#E2E8F0] pb-3">
                <div className="font-mono text-xs text-[#64748B]">
                  {selected.invoice_number}
                </div>
                <div className="text-base font-semibold text-[#0F172A]">
                  {selected.unit_code} — {selected.tenant_name}
                </div>
                <div className="mt-1 text-xs text-[#475569] flex justify-between font-mono tabular-nums">
                  <span>Paid: {formatKES(selected.allocated_amount)}</span>
                  <span>Due: {formatKES(selected.outstanding_balance)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#0F172A]">Line Items</div>
                {selected.lines.map((line) => (
                  <div key={line.id} className="flex justify-between text-xs">
                    <span className="text-[#475569]">{line.description}</span>
                    <span className="font-mono tabular-nums text-[#0F172A]">
                      {formatKES(line.line_total)}
                    </span>
                  </div>
                ))}
              </div>

              {selected.adjustments.length > 0 && (
                <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                  <div className="text-xs font-semibold text-[#0F172A]">
                    Adjustments
                  </div>
                  {selected.adjustments.map((adj) => (
                    <div key={adj.id} className="flex justify-between text-xs">
                      <span className="text-[#475569]">
                        {adj.adjustment_type}: {adj.reason}
                      </span>
                      <span className="font-mono tabular-nums">
                        {adj.adjustment_type === "CREDIT" ? "-" : "+"}
                        {formatKES(adj.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {canApprove && selected.status !== "VOID" && (
                <form
                  onSubmit={handleAdjustment}
                  className="pt-3 border-t border-[#E2E8F0] space-y-2"
                >
                  <div className="text-xs font-semibold text-[#0F172A]">
                    Issue Credit / Debit Note
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={adjType}
                      onChange={(e) =>
                        setAdjType(e.target.value as "CREDIT" | "DEBIT")
                      }
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs bg-white"
                    >
                      <option value="CREDIT">Credit Note (-)</option>
                      <option value="DEBIT">Debit Note (+)</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Amount (KES)"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Reason (e.g. Plumbing repair offset)"
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="w-full border border-[#CBD5E1] rounded px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 text-xs font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
                  >
                    Apply Adjustment
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
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
