"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  clearAuthSession,
  getAccessToken,
  getActiveOrgId,
  setActiveOrgId,
  type MembershipSummary,
  type UserProfile,
} from "@/lib/api";

interface AppShellProps {
  children: (ctx: {
    user: UserProfile;
    activeMembership: MembershipSummary | null;
    reloadProfile: () => Promise<void>;
  }) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrgId, setLocalOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [orgError, setOrgError] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const loadProfile = async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const me = await apiFetch<UserProfile>("/auth/me/", { includeOrg: false });
      setUser(me);

      const storedOrg = getActiveOrgId();
      const validStored = me.memberships.find((m) => m.organization_id === storedOrg);
      const chosen = validStored || me.memberships[0] || null;
      if (chosen) {
        setActiveOrgId(chosen.organization_id);
        setLocalOrgId(chosen.organization_id);
      } else {
        setLocalOrgId(null);
      }
    } catch {
      clearAuthSession();
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    apiFetch<UserProfile>("/auth/me/", { includeOrg: false })
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        const storedOrg = getActiveOrgId();
        const validStored = me.memberships.find((m) => m.organization_id === storedOrg);
        const chosen = validStored || me.memberships[0] || null;
        if (chosen) {
          setActiveOrgId(chosen.organization_id);
          setLocalOrgId(chosen.organization_id);
        } else {
          setLocalOrgId(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleOrgSwitch = (orgId: string) => {
    setActiveOrgId(orgId);
    setLocalOrgId(orgId);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setOrgError("");
    try {
      const created = await apiFetch<{ id: string }>("/organizations/", {
        method: "POST",
        includeOrg: false,
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      setActiveOrgId(created.id);
      setNewOrgName("");
      setShowNewOrg(false);
      await loadProfile();
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : "Could not create organization");
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-sm text-[#475569]">Loading workspace...</div>
      </div>
    );
  }

  const activeMembership =
    user.memberships.find((m) => m.organization_id === activeOrgId) || null;

  const navItems = [
    { href: "/dashboard", label: "Overview" },
    { href: "/properties", label: "Properties" },
    { href: "/tenants", label: "Tenants" },
    { href: "/leases", label: "Leases" },
    { href: "/invoices", label: "Invoices" },
    { href: "/payments", label: "Payments" },
    { href: "/expenses", label: "Expenses" },
    { href: "/maintenance", label: "Maintenance" },
    { href: "/owners", label: "Owners" },
    { href: "/team", label: "Team & Roles" },
    { href: "/audit", label: "Audit Log" },
    { href: "/system", label: "System & Readiness" },
  ];

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      {/* Fixed 240px Left Navigation Rail */}
      <aside className="w-60 shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col justify-between">
        <div>
          <div className="p-4 border-b border-[#E2E8F0]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">
              PMS Back-Office
            </div>
            <div className="mt-2">
              <label
                htmlFor="org-switcher"
                className="block text-xs font-medium text-[#475569] mb-1"
              >
                Organization
              </label>
              <select
                id="org-switcher"
                value={activeOrgId || ""}
                onChange={(e) => handleOrgSwitch(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-medium text-[#0F172A] focus:outline-none focus:border-[#0F5338]"
              >
                {user.memberships.length === 0 && (
                  <option value="">No organizations</option>
                )}
                {user.memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.organization_name} ({m.role})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewOrg((v) => !v)}
                className="mt-2 text-xs font-medium text-[#0F5338] hover:underline"
              >
                + New organization
              </button>
            </div>

            {showNewOrg && (
              <form onSubmit={handleCreateOrg} className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="e.g. Kilimani Properties"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-[#0F5338]"
                />
                {orgError && <p className="text-xs text-[#B91C1C]">{orgError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creatingOrg}
                    className="px-2.5 py-1 text-xs font-medium bg-[#0F5338] hover:bg-[#0B3F2A] text-white rounded disabled:opacity-50"
                  >
                    {creatingOrg ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewOrg(false)}
                    className="px-2.5 py-1 text-xs font-medium border border-[#CBD5E1] rounded text-[#475569]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#ECFDF5] text-[#0F5338] border border-[#A7F3D0]"
                      : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#E2E8F0]">
          <div className="text-xs font-medium text-[#0F172A] truncate">
            {user.full_name || user.email}
          </div>
          <div className="text-xs text-[#64748B] truncate">{user.email}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full text-left text-xs font-medium text-[#B91C1C] hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-6">
        {children({ user, activeMembership, reloadProfile: loadProfile })}
      </main>
    </div>
  );
}
