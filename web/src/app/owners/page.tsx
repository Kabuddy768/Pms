"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiFetch, type OwnerItem, type PaginatedResponse } from "@/lib/api";

function OwnersContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";

  const fetchOwners = async () => {
    const data = await apiFetch<PaginatedResponse<OwnerItem>>("/owners/");
    return data.results;
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchOwners()
      .then((results) => {
        if (!cancelled) {
          setOwners(results);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load owners");
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
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/owners/", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, phone, email }),
      });
      setFullName("");
      setPhone("");
      setEmail("");
      setOwners(await fetchOwners());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add owner");
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E2E8F0] pb-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
          Portfolio
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Property Owners</h1>
      </div>

      {canWrite && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
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
              placeholder="John Kamau"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">Phone</label>
            <input
              type="text"
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
              placeholder="owner@example.co.ke"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="py-1.5 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting ? "Saving..." : "+ Add Owner"}
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
              <th className="py-2.5 px-4">Full Name</th>
              <th className="py-2.5 px-4">Phone</th>
              <th className="py-2.5 px-4">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={3} className="py-6 px-4 text-center text-[#64748B]">
                  Loading owners...
                </td>
              </tr>
            ) : owners.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 px-4 text-center text-[#64748B]">
                  No property owners recorded yet.
                </td>
              </tr>
            ) : (
              owners.map((o) => (
                <tr key={o.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-medium text-[#0F172A]">{o.full_name}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#475569]">
                    {o.phone || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-[#475569]">{o.email || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OwnersPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <OwnersContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
