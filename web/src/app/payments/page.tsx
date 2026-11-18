"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  formatKES,
  type LeaseItem,
  type PaginatedResponse,
  type PaymentItem,
} from "@/lib/api";

function PaymentsContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [tab, setTab] = useState<"all" | "suspense">("all");
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"none" | "manual" | "mpesa">("none");

  // Manual payment form
  const [leaseId, setLeaseId] = useState("");
  const [method, setMethod] = useState<PaymentItem["method"]>("MPESA_PAYBILL");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");

  // M-Pesa C2B callback simulator
  const [cbTransId, setCbTransId] = useState("");
  const [cbAmount, setCbAmount] = useState("");
  const [cbBillRef, setCbBillRef] = useState("");
  const [cbPhone, setCbPhone] = useState("");
  const [cbName, setCbName] = useState("");

  // Assign from suspense
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const loadData = async (activeTab: "all" | "suspense") => {
    const query = activeTab === "suspense" ? "?unmatched=true&page_size=200" : "?page_size=200";
    const [payRes, leaseRes] = await Promise.all([
      apiFetch<PaginatedResponse<PaymentItem>>(`/payments/${query}`),
      apiFetch<PaginatedResponse<LeaseItem>>("/leases/?status=ACTIVE&page_size=200"),
    ]);
    return { payments: payRes.results, leases: leaseRes.results };
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    loadData(tab)
      .then((res) => {
        if (cancelled) return;
        setPayments(res.payments);
        setLeases(res.leases);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load payments");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, tab]);

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/payments/", {
        method: "POST",
        body: JSON.stringify({
          lease: leaseId || null,
          method,
          payment_reference: ref,
          amount,
          auto_allocate: true,
        }),
      });
      setRef("");
      setAmount("");
      setMode("none");
      const res = await loadData(tab);
      setPayments(res.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment");
    }
  };

  const handleMpesaCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/payments/mpesa-callback/", {
        method: "POST",
        body: JSON.stringify({
          trans_id: cbTransId,
          trans_amount: cbAmount,
          bill_ref_number: cbBillRef,
          msisdn: cbPhone,
          first_name: cbName,
        }),
      });
      setCbTransId("");
      setCbAmount("");
      setCbBillRef("");
      setMode("none");
      const res = await loadData(tab);
      setPayments(res.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Callback failed");
    }
  };

  const handleAssign = async (paymentId: string) => {
    const targetLease = assignMap[paymentId];
    if (!targetLease) return;
    setError("");
    try {
      await apiFetch(`/payments/${paymentId}/assign/`, {
        method: "POST",
        body: JSON.stringify({ lease: targetLease, auto_allocate: true }),
      });
      const res = await loadData(tab);
      setPayments(res.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    }
  };

  const handleReverse = async (paymentId: string) => {
    setError("");
    try {
      await apiFetch(`/payments/${paymentId}/reverse/`, {
        method: "POST",
        body: JSON.stringify({ reason: "Reversed from back-office" }),
      });
      const res = await loadData(tab);
      setPayments(res.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reversal failed");
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
            Collections &amp; Reconciliation
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Payments</h1>
        </div>

        {canWrite && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "mpesa" ? "none" : "mpesa")}
              className="px-3 py-1.5 text-xs font-medium border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] rounded"
            >
              Simulate M-Pesa C2B
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "manual" ? "none" : "manual")}
              className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
            >
              + Record Payment
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] text-sm">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`pb-2 px-4 font-medium border-b-2 ${
            tab === "all"
              ? "border-[#0F5338] text-[#0F5338]"
              : "border-transparent text-[#64748B]"
          }`}
        >
          All Payments
        </button>
        <button
          type="button"
          onClick={() => setTab("suspense")}
          className={`pb-2 px-4 font-medium border-b-2 ${
            tab === "suspense"
              ? "border-[#0F5338] text-[#0F5338]"
              : "border-transparent text-[#64748B]"
          }`}
        >
          Unmatched / Suspense Queue
        </button>
      </div>

      {mode === "manual" && canWrite && (
        <form
          onSubmit={handleManualPayment}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Lease (Optional — leave blank for Suspense)
            </label>
            <select
              value={leaseId}
              onChange={(e) => setLeaseId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Unmatched (Suspense)</option>
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.unit_code} — {l.occupants[0]?.tenant_name || l.property_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentItem["method"])}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="MPESA_PAYBILL">M-Pesa Paybill</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Reference (e.g. SJK...)
            </label>
            <input
              type="text"
              required
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="SJK89123XY"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono uppercase"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              required
              placeholder="KES Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded shrink-0"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {mode === "mpesa" && canWrite && (
        <form
          onSubmit={handleMpesaCallback}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">TransID</label>
            <input
              type="text"
              required
              value={cbTransId}
              onChange={(e) => setCbTransId(e.target.value)}
              placeholder="TKL998811"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Amount (KES)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={cbAmount}
              onChange={(e) => setCbAmount(e.target.value)}
              placeholder="30000.00"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              BillRefNumber
            </label>
            <input
              type="text"
              value={cbBillRef}
              onChange={(e) => setCbBillRef(e.target.value)}
              placeholder="Hse A1"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">MSISDN</label>
            <input
              type="text"
              value={cbPhone}
              onChange={(e) => setCbPhone(e.target.value)}
              placeholder="254712345678"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Payer Name
            </label>
            <input
              type="text"
              value={cbName}
              onChange={(e) => setCbName(e.target.value)}
              placeholder="GRACE"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            className="py-1.5 px-3 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded"
          >
            Send C2B Webhook
          </button>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Receipt / Ref</th>
              <th className="py-2.5 px-4">Method</th>
              <th className="py-2.5 px-4">Lease / Payer</th>
              <th className="py-2.5 px-4 text-right">Amount</th>
              <th className="py-2.5 px-4 text-right">Unallocated</th>
              <th className="py-2.5 px-4">Status / Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 px-4 text-center text-[#64748B]">
                  Loading payments...
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-[#64748B]">
                  {tab === "suspense"
                    ? "No unmatched payments in Suspense."
                    : "No payments recorded yet."}
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4">
                    <div className="font-mono text-xs font-medium text-[#0F172A]">
                      {p.receipt_number || "—"}
                    </div>
                    <div className="font-mono text-xs text-[#64748B]">
                      {p.payment_reference}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-[#475569]">
                    {p.method}
                  </td>
                  <td className="py-2.5 px-4">
                    {p.is_matched ? (
                      <div>
                        <span className="font-mono font-medium text-[#0F172A]">
                          {p.unit_code}
                        </span>{" "}
                        <span className="text-[#475569]">• {p.tenant_name || "—"}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded border bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]">
                          UNMATCHED ({p.raw_account_ref || p.payer_phone || "No ref"})
                        </span>
                        {canWrite && p.status === "CONFIRMED" && (
                          <div className="flex gap-1.5 pt-1">
                            <select
                              value={assignMap[p.id] || ""}
                              onChange={(e) =>
                                setAssignMap((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="border border-[#CBD5E1] rounded px-2 py-0.5 text-xs bg-white"
                            >
                              <option value="">Assign lease...</option>
                              {leases.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.unit_code} ({l.occupants[0]?.tenant_name || "Lease"})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAssign(p.id)}
                              className="px-2 py-0.5 text-xs font-medium bg-[#0F5338] text-white rounded"
                            >
                              Match
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#0F172A]">
                    {formatKES(p.amount)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#475569]">
                    {formatKES(p.unallocated_amount)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${
                          p.status === "CONFIRMED"
                            ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                            : p.status === "REVERSED"
                            ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
                            : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
                        }`}
                      >
                        {p.status}
                      </span>
                      {canApprove && p.status === "CONFIRMED" && (
                        <button
                          type="button"
                          onClick={() => handleReverse(p.id)}
                          className="text-xs text-[#B91C1C] hover:underline"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <PaymentsContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
