"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  formatKES,
  type BuildingItem,
  type PaginatedResponse,
  type PropertyItem,
  type PropertyOwnerItem,
  type UnitItem,
} from "@/lib/api";

function PropertyDetailContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [property, setProperty] = useState<PropertyItem | null>(null);
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [owners, setOwners] = useState<PropertyOwnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [buildingName, setBuildingName] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitType, setUnitType] = useState<UnitItem["unit_type"]>("1BR");
  const [unitBuilding, setUnitBuilding] = useState("");
  const [advertisedRent, setAdvertisedRent] = useState("25000.00");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const loadAll = async () => {
    const [propRes, bldgRes, unitRes, ownerRes] = await Promise.all([
      apiFetch<PropertyItem>(`/properties/${propertyId}/`),
      apiFetch<PaginatedResponse<BuildingItem>>(`/buildings/?property=${propertyId}`),
      apiFetch<PaginatedResponse<UnitItem>>(`/units/?property=${propertyId}`),
      apiFetch<PropertyOwnerItem[]>(`/properties/${propertyId}/owners/`),
    ]);
    return {
      propRes,
      bldgRes: bldgRes.results,
      unitRes: unitRes.results,
      ownerRes,
    };
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    loadAll()
      .then((res) => {
        if (cancelled) return;
        setProperty(res.propRes);
        setBuildings(res.bldgRes);
        setUnits(res.unitRes);
        setOwners(res.ownerRes);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load property");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, propertyId]);

  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingName.trim()) return;
    setError("");
    try {
      await apiFetch("/buildings/", {
        method: "POST",
        body: JSON.stringify({ property: propertyId, name: buildingName.trim() }),
      });
      setBuildingName("");
      const res = await loadAll();
      setBuildings(res.bldgRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add building");
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/units/", {
        method: "POST",
        body: JSON.stringify({
          property: propertyId,
          building: unitBuilding || null,
          unit_code: unitCode,
          unit_type: unitType,
          advertised_rent: advertisedRent,
        }),
      });
      setUnitCode("");
      const res = await loadAll();
      setProperty(res.propRes);
      setUnits(res.unitRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add unit");
    }
  };

  if (loading) {
    return <div className="text-sm text-[#475569]">Loading property...</div>;
  }

  if (!property) {
    return (
      <div className="space-y-3">
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error || "Property not found."}
        </div>
        <Link href="/properties" className="text-xs text-[#0F5338] hover:underline">
          ← Back to Properties
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
        <div>
          <Link href="/properties" className="text-xs text-[#0F5338] hover:underline">
            ← Properties
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">{property.name}</h1>
          <div className="text-xs text-[#64748B] mt-0.5">
            {[property.address, property.town, property.county].filter(Boolean).join(" • ") ||
              property.property_type}
          </div>
        </div>
        <span className="px-2.5 py-1 text-xs font-medium rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
          {property.status}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Buildings & Owners Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-md p-4 space-y-3">
          <div className="text-sm font-semibold text-[#0F172A]">Buildings / Blocks</div>
          <div className="flex flex-wrap gap-2">
            {buildings.length === 0 ? (
              <span className="text-xs text-[#64748B]">No buildings (units link directly).</span>
            ) : (
              buildings.map((b) => (
                <span
                  key={b.id}
                  className="px-2.5 py-1 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded"
                >
                  {b.name}
                </span>
              ))
            )}
          </div>
          {canWrite && (
            <form onSubmit={handleAddBuilding} className="flex gap-2 pt-1">
              <input
                type="text"
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                placeholder="e.g. Block A"
                className="flex-1 border border-[#CBD5E1] rounded px-2.5 py-1 text-xs bg-white"
              />
              <button
                type="submit"
                className="px-3 py-1 text-xs font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
              >
                Add Block
              </button>
            </form>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">Beneficial Owners</span>
            <Link href="/owners" className="text-xs text-[#0F5338] hover:underline">
              Manage Owners
            </Link>
          </div>
          {owners.length === 0 ? (
            <div className="text-xs text-[#64748B]">No owners assigned yet.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {owners.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span className="text-[#0F172A]">{o.owner_name}</span>
                  <span className="font-mono tabular-nums text-[#475569]">
                    {o.ownership_share}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Add Unit Form */}
      {canWrite && (
        <form
          onSubmit={handleAddUnit}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Unit Code (Paybill Ref)
            </label>
            <input
              type="text"
              required
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              placeholder="A4"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono uppercase bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Building (Optional)
            </label>
            <select
              value={unitBuilding}
              onChange={(e) => setUnitBuilding(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="">None</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Type</label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as UnitItem["unit_type"])}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="BEDSITTER">Bedsitter</option>
              <option value="STUDIO">Studio</option>
              <option value="1BR">1 Bedroom</option>
              <option value="2BR">2 Bedroom</option>
              <option value="3BR">3 Bedroom</option>
              <option value="SHOP">Shop</option>
              <option value="OFFICE">Office</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Advertised Rent (KES)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={advertisedRent}
              onChange={(e) => setAdvertisedRent(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums bg-white"
            />
          </div>
          <button
            type="submit"
            className="py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded"
          >
            + Add Unit
          </button>
        </form>
      )}

      {/* Units Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Unit Code</th>
              <th className="py-2.5 px-4">Building</th>
              <th className="py-2.5 px-4">Type</th>
              <th className="py-2.5 px-4 text-right">Advertised Rent</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {units.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                  No units added to this property yet.
                </td>
              </tr>
            ) : (
              units.map((u) => (
                <tr key={u.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-mono font-medium text-[#0F172A]">
                    {u.unit_code}
                  </td>
                  <td className="py-2.5 px-4 text-[#475569]">{u.building_name || "—"}</td>
                  <td className="py-2.5 px-4 text-xs font-mono text-[#475569]">
                    {u.unit_type}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#0F172A]">
                    {formatKES(u.advertised_rent)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded border ${
                        u.status === "VACANT"
                          ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
                          : u.status === "OCCUPIED"
                          ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                          : "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"
                      }`}
                    >
                      {u.status}
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

export default function PropertyDetailPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <Suspense
          fallback={<div className="text-sm text-[#475569]">Loading property...</div>}
        >
          <PropertyDetailContent
            orgId={activeMembership?.organization_id || null}
            role={activeMembership?.role || null}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
