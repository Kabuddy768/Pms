"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, saveAuthTokens, setActiveOrgId, type UserProfile } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        const tokens = await apiFetch<{ access: string; refresh: string }>(
          "/auth/token/",
          {
            method: "POST",
            includeOrg: false,
            body: JSON.stringify({ email, password }),
          }
        );
        saveAuthTokens(tokens.access, tokens.refresh);
        const me = await apiFetch<UserProfile>("/auth/me/", { includeOrg: false });
        if (me.memberships.length > 0) {
          setActiveOrgId(me.memberships[0].organization_id);
        }
      } else {
        const res = await apiFetch<{
          access: string;
          refresh: string;
          user: UserProfile;
        }>("/auth/register/", {
          method: "POST",
          includeOrg: false,
          body: JSON.stringify({
            email,
            full_name: fullName,
            password,
            organization_name: organizationName,
          }),
        });
        saveAuthTokens(res.access, res.refresh);
        if (res.user.memberships.length > 0) {
          setActiveOrgId(res.user.memberships[0].organization_id);
        }
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-md p-6">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">
          PMS Back-Office
        </div>
        <h1 className="mt-1 text-xl font-semibold text-[#0F172A]">
          {mode === "login" ? "Sign in to your workspace" : "Create your account"}
        </h1>

        <div className="mt-4 flex border-b border-[#E2E8F0] text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`pb-2 px-3 font-medium border-b-2 ${
              mode === "login"
                ? "border-[#0F5338] text-[#0F5338]"
                : "border-transparent text-[#64748B]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`pb-2 px-3 font-medium border-b-2 ${
              mode === "register"
                ? "border-[#0F5338] text-[#0F5338]"
                : "border-transparent text-[#64748B]"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "register" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alice Wanjiku"
                  className="w-full border border-[#CBD5E1] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Organization / Agency name
                </label>
                <input
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Kilimani Estates Ltd"
                  className="w-full border border-[#CBD5E1] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@kilimani.co.ke"
              className="w-full border border-[#CBD5E1] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full border border-[#CBD5E1] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0F5338]"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded disabled:opacity-50"
          >
            {submitting
              ? "Please wait..."
              : mode === "login"
              ? "Sign in"
              : "Create workspace"}
          </button>
        </form>
      </div>
    </main>
  );
}
