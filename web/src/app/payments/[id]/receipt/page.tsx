"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  apiFetch,
  buildWhatsAppUrl,
  formatKES,
  getAccessToken,
  type OrganizationDetail,
  type PaymentItem,
} from "@/lib/api";

function PrintableReceiptContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentItem | null>(null);
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    Promise.all([
      apiFetch<PaymentItem>(`/payments/${params.id}/`),
      apiFetch<OrganizationDetail>("/organizations/current/"),
    ])
      .then(([payData, orgData]) => {
        if (cancelled) return;
        setPayment(payData);
        setOrg(orgData);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load receipt");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-[#475569]">
        Loading printable receipt...
      </main>
    );
  }

  if (error || !payment) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] p-8">
        <div className="max-w-2xl mx-auto bg-white border border-[#E2E8F0] rounded p-6 space-y-3">
          <div className="text-sm text-[#B91C1C]">{error || "Payment not found"}</div>
          <Link href="/payments" className="text-xs font-medium text-[#0F5338] hover:underline">
            &larr; Back to Payments
          </Link>
        </div>
      </main>
    );
  }

  const recipientName = payment.tenant_name || payment.payer_name || "Tenant";
  const recipientPhone = payment.tenant_phone || payment.payer_phone;
  const receiptRef = payment.receipt_number || payment.payment_reference;
  const whatsappMessage = `Hello ${recipientName}, we confirm receipt of ${formatKES(payment.amount)} (${payment.method}, Ref: ${payment.payment_reference}). Official Receipt: ${receiptRef}${payment.unit_code ? ` for Unit ${payment.unit_code}` : ""}. Thank you.`;

  return (
    <main className="min-h-screen bg-[#F8FAFC] print:bg-white py-8 px-4 print:p-0 text-[#0F172A]">
      <div className="max-w-3xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/payments"
          className="text-xs font-mono text-[#475569] hover:text-[#0F5338]"
        >
          &larr; Back to Payments
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={buildWhatsAppUrl(recipientPhone, whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-xs font-medium rounded"
          >
            Share via WhatsApp
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto bg-white border border-[#E2E8F0] print:border-0 rounded-md p-8 space-y-6">
        <header className="flex flex-wrap justify-between items-start gap-4 border-b border-[#E2E8F0] pb-6">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#0F5338]">
              Official Payment Receipt
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
              {org?.name || "Property Management"}
            </h1>
            <div className="mt-1 text-xs text-[#64748B]">
              {payment.property_name && payment.unit_code
                ? `${payment.property_name} · Unit ${payment.unit_code}`
                : "Unmatched / General Receipt"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-semibold text-[#0F172A]">
              {receiptRef}
            </div>
            <div className="mt-1 text-xs font-mono text-[#64748B] tabular-nums">
              Received: {new Date(payment.received_at).toLocaleString("en-KE")}
            </div>
            <span className="mt-2 inline-block px-2 py-0.5 text-[11px] font-mono rounded border border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]">
              {payment.status}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[#64748B] uppercase font-mono text-[10px]">
              Received From
            </div>
            <div className="mt-1 font-semibold text-sm text-[#0F172A]">{recipientName}</div>
            {recipientPhone && (
              <div className="font-mono text-[#475569]">{recipientPhone}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[#64748B] uppercase font-mono text-[10px]">
              Payment Method &amp; Reference
            </div>
            <div className="mt-1 font-mono text-sm text-[#0F172A]">
              {payment.method} · {payment.payment_reference}
            </div>
          </div>
        </section>

        <table className="w-full text-left border-collapse text-xs border border-[#E2E8F0]">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
              <th className="py-2.5 px-4">Applied Invoice</th>
              <th className="py-2.5 px-4">Allocation Status</th>
              <th className="py-2.5 px-4 text-right">Amount Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {payment.allocations.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-4 text-center text-[#64748B]">
                  Held as unallocated credit on account.
                </td>
              </tr>
            ) : (
              payment.allocations.map((alloc) => (
                <tr key={alloc.id}>
                  <td className="py-2.5 px-4 font-mono text-[#0F172A]">
                    {alloc.invoice_number}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[#475569]">{alloc.status}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                    {formatKES(alloc.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <section className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-xs border border-[#E2E8F0] rounded p-4 bg-[#F8FAFC]">
            <div className="flex justify-between text-sm font-semibold">
              <span>Amount Received</span>
              <span className="font-mono tabular-nums text-[#047857]">
                {formatKES(payment.amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#475569]">Allocated to Invoices</span>
              <span className="font-mono tabular-nums">
                {formatKES(payment.allocated_amount)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#CBD5E1]">
              <span className="text-[#475569]">Unallocated Credit</span>
              <span className="font-mono tabular-nums font-medium">
                {formatKES(payment.unallocated_amount)}
              </span>
            </div>
          </div>
        </section>

        <footer className="pt-4 border-t border-[#E2E8F0] text-[11px] font-mono text-[#64748B] flex justify-between">
          <span>Generated by PMS · Immutable Payment Ledger</span>
          <span>Receipt: {receiptRef}</span>
        </footer>
      </article>
    </main>
  );
}

export default function PrintableReceiptPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-[#475569]">
          Loading receipt...
        </main>
      }
    >
      <PrintableReceiptContent />
    </Suspense>
  );
}
