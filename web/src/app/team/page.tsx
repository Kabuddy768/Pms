"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  apiFetch,
  type OrganizationMember,
  type PaginatedResponse,
} from "@/lib/api";

const ROLES: OrganizationMember["role"][] = [
  "OWNER",
  "MANAGER",
  "ACCOUNTANT",
  "CARETAKER",
];

function TeamContent({
  orgId,
  currentRole,
}: {
  orgId: string | null;
  currentRole: string | null;
}) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<OrganizationMember["role"]>("MANAGER");
  const [submitting, setSubmitting] = useState(false);

  const canManage = currentRole === "OWNER" || currentRole === "MANAGER";

  const fetchMembers = async () => {
    const data = await apiFetch<PaginatedResponse<OrganizationMember>>(
      "/organizations/members/"
    );
    return data.results;
  };

  const loadMembers = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const results = await fetchMembers();
      setMembers(results);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchMembers()
      .then((results) => {
        if (!cancelled) {
          setMembers(results);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load members");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/organizations/members/", {
        method: "POST",
        body: JSON.stringify({
          email,
          full_name: fullName,
          password,
          role,
        }),
      });
      setEmail("");
      setFullName("");
      setPassword("");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (
    memberId: string,
    newRole: OrganizationMember["role"]
  ) => {
    setError("");
    try {
      await apiFetch(`/organizations/members/${memberId}/`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E2E8F0] pb-4">
        <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
          Access Control
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Team &amp; Roles</h1>
      </div>

      {canManage && (
        <form
          onSubmit={handleAddMember}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              User email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@kilimani.co.ke"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Full name <span className="text-[#94A3B8]">(if new user)</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Grace Njeri"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Initial password <span className="text-[#94A3B8]">(if new user)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrganizationMember["role"])}
              className="border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Member"}
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
              <th className="py-2.5 px-4">Member</th>
              <th className="py-2.5 px-4">Email</th>
              <th className="py-2.5 px-4">Role</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                  Loading members...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-center text-[#64748B]">
                  No members found.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-medium text-[#0F172A]">
                    {m.full_name || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-[#475569]">{m.email}</td>
                  <td className="py-2.5 px-4">
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleRoleChange(
                            m.id,
                            e.target.value as OrganizationMember["role"]
                          )
                        }
                        className="border border-[#CBD5E1] rounded px-2 py-1 text-xs bg-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-mono">{m.role}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 text-xs font-medium rounded border bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]">
                      {m.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                    {new Date(m.joined_at).toLocaleDateString("en-KE")}
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

export default function TeamPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <TeamContent
          orgId={activeMembership?.organization_id || null}
          currentRole={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
