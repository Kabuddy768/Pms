"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  apiFetch,
  DEMO_CREDENTIALS,
  loginWithCredentials,
  saveAuthTokens,
  setActiveOrgId,
  type UserProfile,
} from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";

  const [mode, setMode] = useState<"login" | "register">(initialMode);
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
        await loginWithCredentials(email, password);
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
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setSubmitting(true);
    try {
      await loginWithCredentials(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Demo workspace unavailable. Please sign in or register."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md space-y-4">
        <div>
          <Link href="/" className="text-xs font-mono text-[#475569] hover:text-[#0F5338]">
            &larr; Back to PMS overview
          </Link>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-md p-6">
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

          <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-2.5">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={submitting}
              className="w-full py-2 px-4 border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-medium rounded disabled:opacity-50"
            >
              Try Demo Workspace ({DEMO_CREDENTIALS.email})
            </button>

            {/* Reserved Google Sign-In slot (deferred until OAuth client keys are configured) */}
            <button
              type="button"
              disabled
              title="Google Sign-In is disabled until OAuth API credentials are configured."
              className="w-full py-2 px-4 border border-[#E2E8F0] bg-white text-[#94A3B8] text-xs font-medium rounded cursor-not-allowed"
            >
              Continue with Google (Coming Soon — OAuth API Key Pending)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-sm text-[#475569]">
          Loading authentication...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
