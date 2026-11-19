"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
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
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("-received_at");

  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"none" | "manual" | "mpesa">("none");
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);

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

  // Suspense assignment inside drawer
  const [assignLeaseId, setAssignLeaseId] = useState("");
  const [reverseReason, setReverseReason] = useState("");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (tab === "suspense") params.set("unmatched", "true");
    if (search.trim()) params.set("search", search.trim());
    if (methodFilter) params.set("method", methodFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [tab, page, search, methodFilter, statusFilter, ordering]);

  const reloadData = useCallback(
    async (selectId?: string) => {
      const [payRes, leaseRes] = await Promise.all([
        apiFetch<PaginatedResponse<PaymentItem>>(`/payments/${buildQuery()}`),
        apiFetch<PaginatedResponse<LeaseItem>>("/leases/?status=ACTIVE&page_size=200"),
      ]);
      setPayments(payRes.results);
      setTotalCount(payRes.count);
      setLeases(leaseRes.results);
      if (selectId) {
        const updated =
          payRes.results.find((p) => p.id === selectId) ||
          (await apiFetch<PaymentItem>(`/payments/${selectId}/`));
        setSelectedPayment(updated);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<PaginatedResponse<PaymentItem>>(`/payments/${buildQuery()}`),
      apiFetch<PaginatedResponse<LeaseItem>>("/leases/?status=ACTIVE&page_size=200"),
    ])
      .then(([payRes, leaseRes]) => {
        if (cancelled) return;
        setPayments(payRes.results);
        setTotalCount(payRes.count);
        setLeases(leaseRes.results);
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
  }, [orgId, buildQuery]);

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
      await reloadData();
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
      await reloadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Callback failed");
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment || !assignLeaseId) return;
    setError("");
    try {
      await apiFetch(`/payments/${selectedPayment.id}/assign/`, {
        method: "POST",
        body: JSON.stringify({ lease: assignLeaseId, auto_allocate: true }),
      });
      setAssignLeaseId("");
      await reloadData(selectedPayment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    }
  };

  const handleReverse = async () => {
    if (!selectedPayment) return;
    setError("");
    try {
      await apiFetch(`/payments/${selectedPayment.id}/reverse/`, {
        method: "POST",
        body: JSON.stringify({
          reason: reverseReason.trim() || "Reversed from back-office",
        }),
      });
      setReverseReason("");
      await reloadData(selectedPayment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reversal failed");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<PaymentItem>[] = [
    {
      key: "receipt_number",
      header: "Receipt #",
      sortField: "receipt_number",
      render: (p) => (
        <span className="font-mono text-xs text-[#0F5338]">
          {p.receipt_number || "—"}
        </span>
      ),
      csvValue: (p) => p.receipt_number || "",
    },
    {
      key: "payment_reference",
      header: "Ref / Method",
      sortField: "payment_reference",
      render: (p) => (
        <div>
          <div className="font-mono text-xs text-[#0F172A]">{p.payment_reference}</div>
          <div className="text-[11px] text-[#64748B]">{p.method}</div>
        </div>
      ),
      csvValue: (p) => `${p.payment_reference} (${p.method})`,
    },
    {
      key: "payer",
      header: "Lease / Payer",
      render: (p) =>
        p.is_matched ? (
          <div>
            <span className="font-mono text-xs text-[#0F172A]">{p.unit_code}</span>{" "}
            <span className="text-xs text-[#475569]">· {p.tenant_name}</span>
          </div>
        ) : (
          <div className="text-xs">
            <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] font-medium">
              UNMATCHED
            </span>{" "}
            <span className="font-mono text-[#475569]">
              Ref:&ldquo;{p.raw_account_ref}&rdquo; · {p.payer_phone}
            </span>
          </div>
        ),
      csvValue: (p) =>
        p.is_matched
          ? `${p.unit_code} - ${p.tenant_name}`
          : `UNMATCHED (${p.raw_account_ref})`,
    },
    {
      key: "received_at",
      header: "Received",
      sortField: "received_at",
      render: (p) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {new Date(p.received_at).toLocaleDateString("en-KE")}
        </span>
      ),
      csvValue: (p) => p.received_at,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortField: "amount",
      render: (p) => (
        <span className="font-mono tabular-nums font-medium">{formatKES(p.amount)}</span>
      ),
      csvValue: (p) => p.amount,
    },
    {
      key: "unallocated",
      header: "Unallocated",
      align: "right",
      render: (p) => (
        <span className="font-mono tabular-nums text-[#64748B]">
          {formatKES(p.unallocated_amount)}
        </span>
      ),
      csvValue: (p) => p.unallocated_amount,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (p) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            p.status === "CONFIRMED"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
          }`}
        >
          {p.status}
        </span>
      ),
      csvValue: (p) => p.status,
    },
  ];

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
          onClick={() => {
            setPage(1);
            setTab("all");
          }}
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
          onClick={() => {
            setPage(1);
            setTab("suspense");
          }}
          className={`pb-2 px-4 font-medium border-b-2 ${
            tab === "suspense"
              ? "border-[#0F5338] text-[#0F5338]"
              : "border-transparent text-[#64748B]"
          }`}
        >
          Suspense / Unmatched Queue
        </button>
      </div>

      {mode === "manual" && canWrite && (
        <form
          onSubmit={handleManualPayment}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Lease</label>
            <select
              value={leaseId}
              onChange={(e) => setLeaseId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Leave Unmatched (Suspense)</option>
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.unit_code} · {l.occupants[0]?.tenant_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentItem["method"])}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="MPESA_PAYBILL">M-Pesa Paybill</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Reference (Unique)
            </label>
            <input
              type="text"
              required
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="SGH819KL01"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25000.00"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <button
            type="submit"
            className="py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded"
          >
            Save &amp; Auto-Allocate
          </button>
        </form>
      )}

      {mode === "mpesa" && canWrite && (
        <form
          onSubmit={handleMpesaCallback}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <input
            type="text"
            required
            placeholder="TransID (e.g. MPESA991)"
            value={cbTransId}
            onChange={(e) => setCbTransId(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono"
          />
          <input
            type="number"
            step="0.01"
            required
            placeholder="Amount"
            value={cbAmount}
            onChange={(e) => setCbAmount(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono"
          />
          <input
            type="text"
            placeholder="BillRef (e.g. A1 or typo)"
            value={cbBillRef}
            onChange={(e) => setCbBillRef(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono"
          />
          <input
            type="text"
            placeholder="MSISDN (2547...)"
            value={cbPhone}
            onChange={(e) => setCbPhone(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono"
          />
          <input
            type="text"
            placeholder="Payer First Name"
            value={cbName}
            onChange={(e) => setCbName(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="py-1.5 px-3 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded"
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

      <DataTable
        columns={columns}
        rows={payments}
        rowKey={(p) => p.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search receipt, M-Pesa ref, phone, payer..."
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
              value={methodFilter}
              onChange={(e) => {
                setPage(1);
                setMethodFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Methods</option>
              <option value="MPESA_PAYBILL">M-Pesa Paybill</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REVERSED">Reversed</option>
              <option value="PENDING">Pending</option>
            </select>
          </>
        }
        csvFilename="payments.csv"
        loading={loading}
        emptyMessage="No payments match your filters."
        onRowClick={(p) => setSelectedPayment(p)}
        selectedRowKey={selectedPayment?.id || null}
      />

      <SlideOver
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        title={
          selectedPayment?.receipt_number ||
          selectedPayment?.payment_reference ||
          "Payment Detail"
        }
        subtitle={
          selectedPayment
            ? `${selectedPayment.method} · ${selectedPayment.status}`
            : ""
        }
      >
        {selectedPayment && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Amount</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums">
                  {formatKES(selectedPayment.amount)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Allocated</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#047857]">
                  {formatKES(selectedPayment.allocated_amount)}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-[#64748B]">Unallocated</div>
                <div className="mt-1 text-sm font-mono font-semibold tabular-nums text-[#B45309]">
                  {formatKES(selectedPayment.unallocated_amount)}
                </div>
              </div>
            </div>

            <div className="border border-[#E2E8F0] rounded p-3 space-y-1.5">
              <div>
                <span className="text-[#64748B]">Reference:</span>{" "}
                <span className="font-mono text-[#0F172A]">
                  {selectedPayment.payment_reference}
                </span>
              </div>
              <div>
                <span className="text-[#64748B]">Payer:</span>{" "}
                <span>
                  {selectedPayment.payer_name || selectedPayment.tenant_name || "—"}{" "}
                  {selectedPayment.payer_phone
                    ? `(${selectedPayment.payer_phone})`
                    : ""}
                </span>
              </div>
              <div>
                <span className="text-[#64748B]">Raw Account Ref:</span>{" "}
                <span className="font-mono">
                  {selectedPayment.raw_account_ref || "—"}
                </span>
              </div>
            </div>

            {!selectedPayment.is_matched &&
              selectedPayment.status === "CONFIRMED" &&
              canWrite && (
                <form
                  onSubmit={handleAssign}
                  className="border border-[#FDE68A] bg-[#FFFBEB] rounded p-3 space-y-2"
                >
                  <div className="font-semibold text-[#B45309]">
                    Assign Unmatched Payment from Suspense
                  </div>
                  <select
                    required
                    value={assignLeaseId}
                    onChange={(e) => setAssignLeaseId(e.target.value)}
                    className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                  >
                    <option value="">Select active lease...</option>
                    {leases.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.unit_code} · {l.occupants[0]?.tenant_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded"
                  >
                    Match Lease &amp; Allocate FIFO
                  </button>
                </form>
              )}

            <div>
              <div className="font-medium text-[#0F172A] mb-2">
                Allocations ({selectedPayment.allocations.length})
              </div>
              <div className="border border-[#E2E8F0] rounded divide-y divide-[#E2E8F0]">
                {selectedPayment.allocations.length === 0 ? (
                  <div className="p-3 text-[#64748B]">No invoice allocations yet.</div>
                ) : (
                  selectedPayment.allocations.map((a) => (
                    <div key={a.id} className="p-2.5 flex justify-between">
                      <span className="font-mono">
                        {a.invoice_number} ({a.status})
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatKES(a.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {canApprove && selectedPayment.status === "CONFIRMED" && (
              <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
                <div className="font-semibold text-[#B91C1C]">
                  Reverse Payment (Immutable Ledger)
                </div>
                <input
                  type="text"
                  placeholder="Reversal reason (optional)"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                />
                <button
                  type="button"
                  onClick={handleReverse}
                  className="w-full py-1.5 border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] font-medium rounded"
                >
                  Reverse Payment
                </button>
              </div>
            )}
          </div>
        )}
      </SlideOver>
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
