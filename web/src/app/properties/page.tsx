"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import { apiFetch, type PaginatedResponse, type PropertyItem } from "@/lib/api";

function PropertiesContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<PropertyItem | null>(null);

  const [name, setName] = useState("");
  const [propertyType, setPropertyType] =
    useState<PropertyItem["property_type"]>("RESIDENTIAL");
  const [county, setCounty] = useState("Nairobi");
  const [town, setTown] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (typeFilter) params.set("property_type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, typeFilter, statusFilter, ordering]);

  const reload = useCallback(async () => {
    const data = await apiFetch<PaginatedResponse<PropertyItem>>(
      `/properties/${buildQuery()}`
    );
    setProperties(data.results);
    setTotalCount(data.count);
  }, [buildQuery]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    apiFetch<PaginatedResponse<PropertyItem>>(`/properties/${buildQuery()}`)
      .then((data) => {
        if (cancelled) return;
        setProperties(data.results);
        setTotalCount(data.count);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load properties");
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
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/properties/", {
        method: "POST",
        body: JSON.stringify({
          name,
          property_type: propertyType,
          county,
          town,
          address,
        }),
      });
      setName("");
      setTown("");
      setAddress("");
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create property");
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<PropertyItem>[] = [
    {
      key: "name",
      header: "Property",
      sortField: "name",
      render: (p) => (
        <Link
          href={`/properties/${p.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-[#0F5338] hover:underline"
        >
          {p.name}
        </Link>
      ),
      csvValue: (p) => p.name,
    },
    {
      key: "property_type",
      header: "Type",
      sortField: "property_type",
      render: (p) => (
        <span className="text-xs font-mono text-[#475569]">{p.property_type}</span>
      ),
      csvValue: (p) => p.property_type,
    },
    {
      key: "location",
      header: "Location",
      render: (p) => (
        <span className="text-[#475569]">
          {[p.town, p.county].filter(Boolean).join(", ") || "—"}
        </span>
      ),
      csvValue: (p) => [p.town, p.county].filter(Boolean).join(", "),
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      render: (p) => <span className="font-mono tabular-nums">{p.unit_count}</span>,
      csvValue: (p) => p.unit_count,
    },
    {
      key: "vacant",
      header: "Vacant",
      align: "right",
      render: (p) => (
        <span className="font-mono tabular-nums text-[#B45309]">
          {p.vacant_unit_count}
        </span>
      ),
      csvValue: (p) => p.vacant_unit_count,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (p) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            p.status === "ACTIVE"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
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
            Portfolio
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Properties</h1>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
          >
            {showForm ? "Close" : "+ Add Property"}
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Property name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kilimani Heights"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Type</label>
            <select
              value={propertyType}
              onChange={(e) =>
                setPropertyType(e.target.value as PropertyItem["property_type"])
              }
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="MIXED">Mixed Use</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">County</label>
            <input
              type="text"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              placeholder="Nairobi"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Town</label>
            <input
              type="text"
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="Kilimani"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Street address / Landmark
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Argwings Kodhek Rd"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Property"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={properties}
        rowKey={(p) => p.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search name, county, town..."
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
              value={typeFilter}
              onChange={(e) => {
                setPage(1);
                setTypeFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Types</option>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="MIXED">Mixed Use</option>
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
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </>
        }
        csvFilename="properties.csv"
        loading={loading}
        emptyMessage="No properties match your filters."
        onRowClick={(p) => setSelected(p)}
        selectedRowKey={selected?.id || null}
      />

      <SlideOver
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || ""}
        subtitle="Property Summary"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-xs text-[#64748B]">Total Units</div>
                <div className="mt-1 text-lg font-mono font-semibold tabular-nums">
                  {selected.unit_count}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded p-3">
                <div className="text-xs text-[#64748B]">Vacant Units</div>
                <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#B45309]">
                  {selected.vacant_unit_count}
                </div>
              </div>
            </div>
            <div className="border border-[#E2E8F0] rounded p-4 space-y-2 text-xs">
              <div>
                <span className="text-[#64748B]">Type:</span>{" "}
                <span className="font-mono text-[#0F172A]">{selected.property_type}</span>
              </div>
              <div>
                <span className="text-[#64748B]">Location:</span>{" "}
                <span className="text-[#0F172A]">
                  {[selected.address, selected.town, selected.county]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </span>
              </div>
              <div>
                <span className="text-[#64748B]">Status:</span>{" "}
                <span className="font-mono">{selected.status}</span>
              </div>
            </div>
            <Link
              href={`/properties/${selected.id}`}
              className="inline-block px-4 py-2 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded"
            >
              Manage Buildings, Units &amp; Owners &rarr;
            </Link>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function PropertiesPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <PropertiesContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
