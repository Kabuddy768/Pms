"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  type AuditEventItem,
  type PaginatedResponse,
} from "@/lib/api";

function AuditContent({ orgId }: { orgId: string | null }) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [ordering, setOrdering] = useState("-occurred_at");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEventItem | null>(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (entityFilter) params.set("entity_type", entityFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, entityFilter, ordering]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    apiFetch<PaginatedResponse<AuditEventItem>>(`/audit-events/${buildQuery()}`)
      .then((data) => {
        if (!cancelled) {
          setEvents(data.results);
          setTotalCount(data.count);
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
  }, [orgId, buildQuery]);

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<AuditEventItem>[] = [
    {
      key: "occurred_at",
      header: "Timestamp",
      sortField: "occurred_at",
      render: (ev) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {new Date(ev.occurred_at).toLocaleString("en-KE")}
        </span>
      ),
      csvValue: (ev) => ev.occurred_at,
    },
    {
      key: "action",
      header: "Action",
      sortField: "action",
      render: (ev) => (
        <span className="font-mono text-xs font-medium text-[#0F172A]">
          {ev.action}
        </span>
      ),
      csvValue: (ev) => ev.action,
    },
    {
      key: "entity_type",
      header: "Entity",
      sortField: "entity_type",
      render: (ev) => <span className="text-xs text-[#475569]">{ev.entity_type}</span>,
      csvValue: (ev) => ev.entity_type,
    },
    {
      key: "actor",
      header: "Actor",
      render: (ev) => (
        <span className="text-xs text-[#475569]">{ev.actor_email || "System"}</span>
      ),
      csvValue: (ev) => ev.actor_email || "System",
    },
    {
      key: "metadata",
      header: "Metadata",
      render: (ev) => (
        <span className="font-mono text-xs text-[#64748B] block truncate max-w-xs">
          {JSON.stringify(ev.metadata)}
        </span>
      ),
      csvValue: (ev) => JSON.stringify(ev.metadata),
    },
  ];

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

      <DataTable
        columns={columns}
        rows={events}
        rowKey={(ev) => ev.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search action, entity, actor email..."
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
            value={entityFilter}
            onChange={(e) => {
              setPage(1);
              setEntityFilter(e.target.value);
            }}
            className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
          >
            <option value="">All Entities</option>
            <option value="Organization">Organization</option>
            <option value="OrganizationMembership">Membership</option>
            <option value="Property">Property</option>
            <option value="Unit">Unit</option>
            <option value="Lease">Lease</option>
            <option value="Invoice">Invoice</option>
            <option value="Payment">Payment</option>
            <option value="Expense">Expense</option>
            <option value="MaintenanceRequest">Maintenance</option>
          </select>
        }
        csvFilename="audit_log.csv"
        loading={loading}
        emptyMessage="No audit events match your filters."
        onRowClick={(ev) => setSelected(ev)}
        selectedRowKey={selected?.id || null}
      />

      <SlideOver
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.action || "Audit Event"}
        subtitle={selected ? `${selected.entity_type} · ${selected.entity_id}` : ""}
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="border border-[#E2E8F0] rounded p-3 space-y-1.5">
              <div>
                <span className="text-[#64748B]">Occurred:</span>{" "}
                <span className="font-mono tabular-nums text-[#0F172A]">
                  {new Date(selected.occurred_at).toLocaleString("en-KE")}
                </span>
              </div>
              <div>
                <span className="text-[#64748B]">Actor:</span>{" "}
                <span className="text-[#0F172A]">{selected.actor_email || "System"}</span>
              </div>
              <div>
                <span className="text-[#64748B]">Entity ID:</span>{" "}
                <span className="font-mono text-[#0F172A]">{selected.entity_id}</span>
              </div>
            </div>
            <div>
              <div className="text-[#64748B] font-medium mb-1">Payload Metadata</div>
              <pre className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded font-mono text-[11px] overflow-x-auto">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </SlideOver>
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
