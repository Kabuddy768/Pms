"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  type MaintenanceRequestItem,
  type PaginatedResponse,
  type PropertyItem,
  type UnitItem,
} from "@/lib/api";

const STATUSES: MaintenanceRequestItem["status"][] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

function MaintenanceContent({ orgId }: { orgId: string | null }) {
  const [requests, setRequests] = useState<MaintenanceRequestItem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<MaintenanceRequestItem["priority"]>("MEDIUM");

  const loadAll = async () => {
    const [reqRes, propRes, unitRes] = await Promise.all([
      apiFetch<PaginatedResponse<MaintenanceRequestItem>>("/maintenance-requests/"),
      apiFetch<PaginatedResponse<PropertyItem>>("/properties/"),
      apiFetch<PaginatedResponse<UnitItem>>("/units/"),
    ]);
    return {
      requests: reqRes.results,
      properties: propRes.results,
      units: unitRes.results,
    };
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    loadAll()
      .then((res) => {
        if (cancelled) return;
        setRequests(res.requests);
        setProperties(res.properties);
        setUnits(res.units);
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
  }, [orgId]);

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
      const res = await loadAll();
      setRequests(res.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create request");
    }
  };

  const handleStatusChange = async (
    id: string,
    newStatus: MaintenanceRequestItem["status"]
  ) => {
    setError("");
    try {
      await apiFetch(`/maintenance-requests/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      const res = await loadAll();
      setRequests(res.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const filteredUnits = units.filter((u) => !propertyId || u.property === propertyId);

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
          <label className="block text-xs font-medium text-[#475569] mb-1">Property</label>
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
            className="px-3.5 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded shrink-0"
          >
            Log Issue
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Issue</th>
              <th className="py-2.5 px-4">Property / Unit</th>
              <th className="py-2.5 px-4">Priority</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6 px-4 text-center text-[#64748B]">
                  Loading requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-[#64748B]">
                  No maintenance requests logged.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-medium text-[#0F172A]">{r.title}</td>
                  <td className="py-2.5 px-4 text-[#475569]">
                    {r.property_name}
                    {r.unit_code ? ` • ${r.unit_code}` : ""}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.priority}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={r.status}
                      onChange={(e) =>
                        handleStatusChange(
                          r.id,
                          e.target.value as MaintenanceRequestItem["status"]
                        )
                      }
                      className="border border-[#CBD5E1] rounded px-2 py-1 text-xs bg-white"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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

export default function MaintenancePage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <MaintenanceContent orgId={activeMembership?.organization_id || null} />
      )}
    </AppShell>
  );
}
