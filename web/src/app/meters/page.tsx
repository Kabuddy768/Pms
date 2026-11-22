"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import {
  apiFetch,
  formatKES,
  type PaginatedResponse,
  type UnitItem,
  type UtilityMeterReadingItem,
} from "@/lib/api";

function MetersContent({ orgId }: { orgId: string | null }) {
  const [readings, setReadings] = useState<UtilityMeterReadingItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [chargeFilter, setChargeFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [ordering, setOrdering] = useState("-billing_period");

  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // New reading form
  const [unitId, setUnitId] = useState("");
  const [chargeType, setChargeType] =
    useState<UtilityMeterReadingItem["charge_type"]>("WATER");
  const [billingPeriod, setBillingPeriod] = useState("2026-11");
  const [prevReading, setPrevReading] = useState("");
  const [currReading, setCurrReading] = useState("");
  const [unitRate, setUnitRate] = useState("150.00");
  const [submitting, setSubmitting] = useState(false);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (chargeFilter) params.set("charge_type", chargeFilter);
    if (periodFilter) params.set("billing_period", periodFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, chargeFilter, periodFilter, ordering]);

  const reloadAll = useCallback(async () => {
    const [meterRes, unitRes] = await Promise.all([
      apiFetch<PaginatedResponse<UtilityMeterReadingItem>>(
        `/meter-readings/${buildQuery()}`
      ),
      apiFetch<PaginatedResponse<UnitItem>>("/units/?page_size=200"),
    ]);
    setReadings(meterRes.results);
    setTotalCount(meterRes.count);
    setUnits(unitRes.results);
  }, [buildQuery]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<PaginatedResponse<UtilityMeterReadingItem>>(
        `/meter-readings/${buildQuery()}`
      ),
      apiFetch<PaginatedResponse<UnitItem>>("/units/?page_size=200"),
    ])
      .then(([meterRes, unitRes]) => {
        if (cancelled) return;
        setReadings(meterRes.results);
        setTotalCount(meterRes.count);
        setUnits(unitRes.results);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load meter readings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, buildQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const created = await apiFetch<UtilityMeterReadingItem>("/meter-readings/", {
        method: "POST",
        body: JSON.stringify({
          unit: unitId,
          charge_type: chargeType,
          billing_period: billingPeriod,
          previous_reading: prevReading,
          current_reading: currReading,
          unit_rate: unitRate,
        }),
      });
      setPrevReading("");
      setCurrReading("");
      setNotice(
        `Saved ${created.charge_type} reading for ${created.unit_code} (${formatKES(created.total_amount)}). It will auto-attach to the ${created.billing_period} monthly invoice.`
      );
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record meter reading");
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<UtilityMeterReadingItem>[] = [
    {
      key: "billing_period",
      header: "Period",
      sortField: "billing_period",
      render: (r) => (
        <span className="font-mono text-xs text-[#0F172A] tabular-nums">
          {r.billing_period}
        </span>
      ),
      csvValue: (r) => r.billing_period,
    },
    {
      key: "unit_code",
      header: "Property / Unit",
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-medium text-[#0F172A]">
            {r.unit_code}
          </span>
          <span className="text-xs text-[#64748B]"> · {r.property_name}</span>
        </div>
      ),
      csvValue: (r) => `${r.property_name} - ${r.unit_code}`,
    },
    {
      key: "charge_type",
      header: "Utility",
      render: (r) => <span className="font-mono text-xs">{r.charge_type}</span>,
      csvValue: (r) => r.charge_type,
    },
    {
      key: "readings",
      header: "Prev -> Curr (Units)",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs tabular-nums text-[#475569]">
          {r.previous_reading} &rarr; {r.current_reading} ({r.units_consumed})
        </span>
      ),
      csvValue: (r) => `${r.previous_reading} -> ${r.current_reading} (${r.units_consumed})`,
    },
    {
      key: "total_amount",
      header: "Total",
      align: "right",
      sortField: "total_amount",
      render: (r) => (
        <span className="font-mono tabular-nums font-medium">
          {formatKES(r.total_amount)}
        </span>
      ),
      csvValue: (r) => r.total_amount,
    },
    {
      key: "billing_status",
      header: "Invoice Link",
      render: (r) =>
        r.billed_invoice_number ? (
          <span className="px-2 py-0.5 text-xs font-mono rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
            {r.billed_invoice_number}
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs font-mono rounded border bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]">
            PENDING BILLING
          </span>
        ),
      csvValue: (r) => r.billed_invoice_number || "PENDING BILLING",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E2E8F0] pb-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
          Metered Billing
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">
          Water &amp; Utility Meter Readings
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-7 gap-3 items-end"
      >
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-[#475569] mb-1">Unit</label>
          <select
            required
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
          >
            <option value="">Select unit...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.property_name} · {u.unit_code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Utility</label>
          <select
            value={chargeType}
            onChange={(e) =>
              setChargeType(e.target.value as UtilityMeterReadingItem["charge_type"])
            }
            className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
          >
            <option value="WATER">WATER</option>
            <option value="GARBAGE">GARBAGE</option>
            <option value="SERVICE_CHARGE">SERVICE_CHARGE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Period</label>
          <input
            type="month"
            required
            value={billingPeriod}
            onChange={(e) => setBillingPeriod(e.target.value)}
            className="w-full border border-[#CBD5E1] rounded px-2 py-1.5 text-sm font-mono bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">
            Prev Reading
          </label>
          <input
            type="number"
            step="0.01"
            required
            value={prevReading}
            onChange={(e) => setPrevReading(e.target.value)}
            placeholder="100.00"
            className="w-full border border-[#CBD5E1] rounded px-2 py-1.5 text-sm font-mono bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">
            Curr Reading
          </label>
          <input
            type="number"
            step="0.01"
            required
            value={currReading}
            onChange={(e) => setCurrReading(e.target.value)}
            placeholder="112.00"
            className="w-full border border-[#CBD5E1] rounded px-2 py-1.5 text-sm font-mono bg-white"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            required
            value={unitRate}
            onChange={(e) => setUnitRate(e.target.value)}
            title="Rate per unit (KES)"
            className="w-24 border border-[#CBD5E1] rounded px-2 py-1.5 text-sm font-mono bg-white"
          />
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-1.5 px-3 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting ? "..." : "Save"}
          </button>
        </div>
      </form>

      {notice && (
        <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded text-xs text-[#047857]">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={readings}
        rowKey={(r) => r.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search unit or property..."
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
              value={chargeFilter}
              onChange={(e) => {
                setPage(1);
                setChargeFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Utilities</option>
              <option value="WATER">Water</option>
              <option value="GARBAGE">Garbage</option>
              <option value="SERVICE_CHARGE">Service Charge</option>
            </select>
            <input
              type="month"
              value={periodFilter}
              onChange={(e) => {
                setPage(1);
                setPeriodFilter(e.target.value);
              }}
              aria-label="Filter by month"
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs font-mono bg-white"
            />
          </>
        }
        csvFilename="meter_readings.csv"
        loading={loading}
        emptyMessage="No utility meter readings recorded yet."
      />
    </div>
  );
}

export default function MetersPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <MetersContent orgId={activeMembership?.organization_id || null} />
      )}
    </AppShell>
  );
}
