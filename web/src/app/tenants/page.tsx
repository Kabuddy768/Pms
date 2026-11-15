"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, type PaginatedResponse, type TenantItem } from "@/lib/api";

function TenantsContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const fetchTenants = async (q: string) => {
    const query = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
    const data = await apiFetch<PaginatedResponse<TenantItem>>(`/tenants/${query}`);
    return data.results;
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchTenants(search)
      .then((results) => {
        if (!cancelled) {
          setTenants(results);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tenants");
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
      await apiFetch("/tenants/", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email,
          national_id: nationalId,
        }),
      });
      setFullName("");
      setPhone("");
      setEmail("");
      setNationalId("");
      setShowForm(false);
      setTenants(await fetchTenants(search));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add tenant");
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
            Occupancy
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Tenants</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            className="border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white w-64 focus:outline-none focus:border-[#0F5338]"
          />
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="px-3.5 py-1.5 text-sm font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded"
            >
              {showForm ? "Close" : "+ Add Tenant"}
            </button>
          )}
        </div>
      </div>

      {showForm && canWrite && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Full name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Grace Muthoni"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Phone (M-Pesa)
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254712345678"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="grace@example.com"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              National ID (Optional)
            </label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="12345678"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Tenant"}
          </button>
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
              <th className="py-2.5 px-4">Tenant</th>
              <th className="py-2.5 px-4">Phone</th>
              <th className="py-2.5 px-4">Email</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6 px-4 text-center text-[#64748B]">
                  Loading tenants...
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-[#64748B]">
                  No tenants registered yet.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-medium text-[#0F172A]">{t.full_name}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#0F172A]">{t.phone}</td>
                  <td className="py-2.5 px-4 text-[#475569]">{t.email || "—"}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 text-xs font-medium rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
                      {t.status}
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

export default function TenantsPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <TenantsContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
