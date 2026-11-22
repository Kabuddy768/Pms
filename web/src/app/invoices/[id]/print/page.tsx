"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  apiFetch,
  buildWhatsAppUrl,
  formatKES,
  getAccessToken,
  type InvoiceItem,
  type OrganizationDetail,
} from "@/lib/api";

function PrintableInvoiceContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceItem | null>(null);
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
      apiFetch<InvoiceItem>(`/invoices/${params.id}/`),
      apiFetch<OrganizationDetail>("/organizations/current/"),
    ])
      .then(([inv, orgData]) => {
        if (cancelled) return;
        setInvoice(inv);
        setOrg(orgData);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load invoice");
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
        Loading printable invoice...
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] p-8">
        <div className="max-w-2xl mx-auto bg-white border border-[#E2E8F0] rounded p-6 space-y-3">
          <div className="text-sm text-[#B91C1C]">{error || "Invoice not found"}</div>
          <Link href="/invoices" className="text-xs font-medium text-[#0F5338] hover:underline">
            &larr; Back to Invoices
          </Link>
        </div>
      </main>
    );
  }

  const whatsappMessage = `Hello ${invoice.tenant_name}, here is your rent invoice ${invoice.invoice_number} for Unit ${invoice.unit_code} (${invoice.property_name}). Total due: ${formatKES(invoice.outstanding_balance)} by ${invoice.due_date}.`;

  return (
    <main className="min-h-screen bg-[#F8FAFC] print:bg-white py-8 px-4 print:p-0 text-[#0F172A]">
      {/* Non-printable action bar */}
      <div className="max-w-3xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/invoices"
          className="text-xs font-mono text-[#475569] hover:text-[#0F5338]"
        >
          &larr; Back to Invoices
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={buildWhatsAppUrl(invoice.tenant_phone, whatsappMessage)}
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

      {/* Printable Invoice Sheet */}
      <article className="max-w-3xl mx-auto bg-white border border-[#E2E8F0] print:border-0 rounded-md p-8 space-y-6">
        <header className="flex flex-wrap justify-between items-start gap-4 border-b border-[#E2E8F0] pb-6">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#0F5338]">
              Tax / Rent Invoice
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
              {org?.name || "Property Management"}
            </h1>
            <div className="mt-1 text-xs text-[#64748B]">
              Property: {invoice.property_name} · Unit {invoice.unit_code}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-semibold text-[#0F172A]">
              {invoice.invoice_number}
            </div>
            <div className="mt-1 text-xs font-mono text-[#64748B] tabular-nums">
              Issued: {invoice.issue_date}
            </div>
            <div className="text-xs font-mono text-[#64748B] tabular-nums">
              Due: {invoice.due_date}
            </div>
            <span className="mt-2 inline-block px-2 py-0.5 text-[11px] font-mono rounded border border-[#CBD5E1] bg-[#F8FAFC]">
              {invoice.status}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[#64748B] uppercase font-mono text-[10px]">Billed To</div>
            <div className="mt-1 font-semibold text-sm text-[#0F172A]">
              {invoice.tenant_name}
            </div>
            {invoice.tenant_phone && (
              <div className="font-mono text-[#475569]">{invoice.tenant_phone}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[#64748B] uppercase font-mono text-[10px]">
              Billing Period &amp; Paybill Ref
            </div>
            <div className="mt-1 font-mono text-sm text-[#0F172A]">
              {invoice.billing_period || "Manual"} · Ref: {invoice.unit_code}
            </div>
          </div>
        </section>

        <table className="w-full text-left border-collapse text-xs border border-[#E2E8F0]">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
              <th className="py-2.5 px-4">Description</th>
              <th className="py-2.5 px-4 text-right">Qty</th>
              <th className="py-2.5 px-4 text-right">Unit Rate</th>
              <th className="py-2.5 px-4 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2.5 px-4 text-[#0F172A]">{line.description}</td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {line.quantity}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {formatKES(line.unit_amount)}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                  {formatKES(line.line_total)}
                </td>
              </tr>
            ))}
            {invoice.adjustments.map((adj) => (
              <tr key={adj.id} className="bg-[#F8FAFC]">
                <td colSpan={3} className="py-2 px-4 text-[#475569]">
                  Adjustment ({adj.adjustment_type}): {adj.reason}
                </td>
                <td className="py-2 px-4 text-right font-mono tabular-nums">
                  {adj.adjustment_type === "CREDIT" ? "-" : "+"}
                  {formatKES(adj.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-xs border border-[#E2E8F0] rounded p-4 bg-[#F8FAFC]">
            <div className="flex justify-between">
              <span className="text-[#475569]">Adjusted Total</span>
              <span className="font-mono tabular-nums font-medium">
                {formatKES(invoice.adjusted_total)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#475569]">Paid / Allocated</span>
              <span className="font-mono tabular-nums text-[#047857]">
                -{formatKES(invoice.allocated_amount)}
              </span>
            </div>
            <div className="pt-2 border-t border-[#CBD5E1] flex justify-between text-sm font-semibold">
              <span>Balance Due</span>
              <span className="font-mono tabular-nums text-[#B91C1C]">
                {formatKES(invoice.outstanding_balance)}
              </span>
            </div>
          </div>
        </section>

        <footer className="pt-4 border-t border-[#E2E8F0] text-[11px] font-mono text-[#64748B] flex justify-between">
          <span>Generated by PMS · Immutable Billing Ledger</span>
          <span>Account Reference: {invoice.unit_code}</span>
        </footer>
      </article>
    </main>
  );
}

export default function PrintableInvoicePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-[#475569]">
          Loading invoice...
        </main>
      }
    >
      <PrintableInvoiceContent />
    </Suspense>
  );
}
