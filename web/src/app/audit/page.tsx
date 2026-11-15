"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  type AuditEventItem,
  type PaginatedResponse,
} from "@/lib/api";

function AuditContent({ orgId }: { orgId: string | null }) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    apiFetch<PaginatedResponse<AuditEventItem>>("/audit-events/")
      .then((data) => {
        if (!cancelled) {
          setEvents(data.results);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load audit events");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E2E8F0] pb-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
          Security &amp; Compliance
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Audit Log</h1>
      </div>

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-4">Action</th>
              <th className="py-2.5 px-4">Entity</th>
              <th className="py-2.5 px-4">Actor</th>
              <th className="py-2.5 px-4">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                  Loading audit events...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                  No audit events recorded yet.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                    {new Date(ev.occurred_at).toLocaleString("en-KE")}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs font-medium text-[#0F172A]">
                    {ev.action}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-[#475569]">
                    {ev.entity_type}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-[#475569]">
                    {ev.actor_email || "System"}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#64748B] truncate max-w-xs">
                    {JSON.stringify(ev.metadata)}
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

export default function AuditPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <AuditContent orgId={activeMembership?.organization_id || null} />
      )}
    </AppShell>
  );
}
