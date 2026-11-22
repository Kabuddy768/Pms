"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AttachmentList } from "@/components/AttachmentList";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  type MaintenanceRequestItem,
  type PaginatedResponse,
  type PropertyItem,
  type UnitItem,
} from "@/lib/api";

function MaintenanceContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const canDeleteAttach =
    role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const [requests, setRequests] = useState<MaintenanceRequestItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [ordering, setOrdering] = useState("-created_at");

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [selected, setSelected] = useState<MaintenanceRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] =
    useState<MaintenanceRequestItem["priority"]>("MEDIUM");

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, statusFilter, priorityFilter, ordering]);

  const reloadAll = useCallback(
    async (selectId?: string) => {
      const [reqRes, propRes, unitRes] = await Promise.all([
        apiFetch<PaginatedResponse<MaintenanceRequestItem>>(
          `/maintenance-requests/${buildQuery()}`
        ),
        apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
        apiFetch<PaginatedResponse<UnitItem>>("/units/?page_size=200"),
      ]);
      setRequests(reqRes.results);
      setTotalCount(reqRes.count);
      setProperties(propRes.results);
      setUnits(unitRes.results);
      if (selectId) {
        const updated =
          reqRes.results.find((r) => r.id === selectId) ||
          (await apiFetch<MaintenanceRequestItem>(
            `/maintenance-requests/${selectId}/`
          ));
        setSelected(updated);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<PaginatedResponse<MaintenanceRequestItem>>(
        `/maintenance-requests/${buildQuery()}`
      ),
      apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
      apiFetch<PaginatedResponse<UnitItem>>("/units/?page_size=200"),
    ])
      .then(([reqRes, propRes, unitRes]) => {
        if (cancelled) return;
        setRequests(reqRes.results);
        setTotalCount(reqRes.count);
        setProperties(propRes.results);
        setUnits(unitRes.results);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load requests");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, buildQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/maintenance-requests/", {
        method: "POST",
        body: JSON.stringify({
          property: propertyId,
          unit: unitId || null,
          title,
          priority,
        }),
      });
      setTitle("");
      setUnitId("");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create request");
    }
  };

  const handlePatch = async (
    id: string,
    payload: Partial<Pick<MaintenanceRequestItem, "status" | "priority">>
  ) => {
    setError("");
    try {
      await apiFetch(`/maintenance-requests/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await reloadAll(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update ticket");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const filteredUnits = units.filter((u) => !propertyId || u.property === propertyId);

  const columns: DataTableColumn<MaintenanceRequestItem>[] = [
    {
      key: "location",
      header: "Property / Unit",
      render: (r) => (
        <span className="font-mono text-xs text-[#0F172A]">
          {r.property_name}
          {r.unit_code ? ` · ${r.unit_code}` : ""}
        </span>
      ),
      csvValue: (r) =>
        `${r.property_name}${r.unit_code ? ` - ${r.unit_code}` : ""}`,
    },
    {
      key: "title",
      header: "Issue",
      render: (r) => <span className="font-medium text-[#0F172A]">{r.title}</span>,
      csvValue: (r) => r.title,
    },
    {
      key: "priority",
      header: "Priority",
      sortField: "priority",
      render: (r) => (
        <span
          className={`px-2 py-0.5 text-xs font-mono rounded border ${
            r.priority === "URGENT" || r.priority === "HIGH"
              ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
              : "bg-[#F8FAFC] text-[#475569] border-[#CBD5E1]"
          }`}
        >
          {r.priority}
        </span>
      ),
      csvValue: (r) => r.priority,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (r) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            r.status === "RESOLVED" || r.status === "CLOSED"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : r.status === "IN_PROGRESS"
              ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
              : "bg-[#F8FAFC] text-[#0F172A] border-[#CBD5E1]"
          }`}
        >
          {r.status}
        </span>
      ),
      csvValue: (r) => r.status,
    },
    {
      key: "created_at",
      header: "Logged",
      sortField: "created_at",
      render: (r) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {new Date(r.created_at).toLocaleDateString("en-KE")}
        </span>
      ),
      csvValue: (r) => r.created_at,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E2E8F0] pb-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
          Operations
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
          Maintenance Requests
        </h1>
      </div>

      <form
        onSubmit={handleCreate}
        className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">
            Property
          </label>
          <select
            required
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setUnitId("");
            }}
            className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
          >
            <option value="">Select property...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">
            Unit (Optional)
          </label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
          >
            <option value="">Common area</option>
            {filteredUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_code}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-[#475569] mb-1">Issue</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leaking kitchen tap"
            className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value as MaintenanceRequestItem["priority"])
            }
            className="border border-[#CBD5E1] rounded px-2 py-1.5 text-xs bg-white"
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
          <button
            type="submit"
            className="flex-1 py-1.5 px-3 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded"
          >
            Log
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(r) => r.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search issue, property, unit..."
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
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPage(1);
                setPriorityFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </>
        }
        csvFilename="maintenance.csv"
        loading={loading}
        emptyMessage="No maintenance requests match your filters."
        onRowClick={(r) => setSelected(r)}
        selectedRowKey={selected?.id || null}
      />

      <SlideOver
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title || "Maintenance Ticket"}
        subtitle={
          selected
            ? `${selected.property_name}${
                selected.unit_code ? ` · Unit ${selected.unit_code}` : " · Common Area"
              }`
            : ""
        }
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="border border-[#E2E8F0] rounded p-3 space-y-1.5">
              <div>
                <span className="text-[#64748B]">Reported by:</span>{" "}
                <span>{selected.created_by_email || "—"}</span>
              </div>
              <div>
                <span className="text-[#64748B]">Logged on:</span>{" "}
                <span className="font-mono tabular-nums">
                  {new Date(selected.created_at).toLocaleString("en-KE")}
                </span>
              </div>
              {selected.description && (
                <div className="pt-1 text-[#0F172A]">{selected.description}</div>
              )}
            </div>

            <div className="border border-[#E2E8F0] rounded p-3 space-y-3">
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Update Status
                </label>
                <select
                  value={selected.status}
                  onChange={(e) =>
                    handlePatch(selected.id, {
                      status: e.target.value as MaintenanceRequestItem["status"],
                    })
                  }
                  className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Update Priority
                </label>
                <select
                  value={selected.priority}
                  onChange={(e) =>
                    handlePatch(selected.id, {
                      priority: e.target.value as MaintenanceRequestItem["priority"],
                    })
                  }
                  className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
            </div>

            <AttachmentList
              entityType="MAINTENANCE"
              entityId={selected.id}
              canWrite={true}
              canDelete={canDeleteAttach}
              heading="Maintenance Photos & Quotes (URL-Only)"
            />
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <MaintenanceContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
