"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  type PaginatedResponse,
  type PropertyItem,
} from "@/lib/api";

function PropertiesContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [propertyType, setPropertyType] =
    useState<PropertyItem["property_type"]>("RESIDENTIAL");
  const [county, setCounty] = useState("Nairobi");
  const [town, setTown] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const fetchProperties = async (q: string) => {
    const query = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
    const data = await apiFetch<PaginatedResponse<PropertyItem>>(`/properties/${query}`);
    return data.results;
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchProperties(search)
      .then((results) => {
        if (!cancelled) {
          setProperties(results);
          setError("");
        }
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
  }, [orgId, search]);

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
      const refreshed = await fetchProperties(search);
      setProperties(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create property");
    } finally {
      setSubmitting(false);
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
            Portfolio
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Properties</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, county, town..."
            className="border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white w-64 focus:outline-none focus:border-[#0F5338]"
          />
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

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Property</th>
              <th className="py-2.5 px-4">Type</th>
              <th className="py-2.5 px-4">Location</th>
              <th className="py-2.5 px-4 text-right">Units</th>
              <th className="py-2.5 px-4 text-right">Vacant</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 px-4 text-center text-[#64748B]">
                  Loading properties...
                </td>
              </tr>
            ) : properties.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-[#64748B]">
                  No properties yet. Add your first property to start adding units.
                </td>
              </tr>
            ) : (
              properties.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-medium">
                    <Link
                      href={`/properties/${p.id}`}
                      className="text-[#0F5338] hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-[#475569]">
                    {p.property_type}
                  </td>
                  <td className="py-2.5 px-4 text-[#475569]">
                    {[p.town, p.county].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {p.unit_count}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {p.vacant_unit_count}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded border ${
                        p.status === "ACTIVE"
                          ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                          : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
                      }`}
                    >
                      {p.status}
                    </span>
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
