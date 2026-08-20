"use client";

/**
 * Login page — email/phone + password.
 *
 * First-login flow for teachers / staff:
 *   • Initial password = school username (slug), e.g. "kianyaga" or "@kianyaga"
 *   • On first login mustChangePassword === true → ForcePasswordChangeModal appears
 *
 * Per-school email model:
 *   Same email at two schools → API returns requiresSchoolSlug=true → school
 *   username field appears so the user can disambiguate.
 */

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Mail, Lock, School, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

const inputClsRight =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-10 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = params.get("notice");
  const nextPath = params.get("next");

  const [identifier,  setIdentifier]  = useState("");
  const [password,    setPassword]    = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [schoolSlug,  setSchoolSlug]  = useState("");
  const [needsSlug,   setNeedsSlug]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  // Pre-fill identifier from sessionStorage (convenience on repeat visits)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bidii_login_id");
      if (saved) setIdentifier(saved);
    } catch { /* ignore */ }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimId  = identifier.trim().toLowerCase();
    const trimPwd = password.trim();
    const trimSlug = schoolSlug.trim().replace(/^@/, "");

    if (!trimId)  { setError("Enter your email address or phone number."); return; }
    if (!trimPwd) { setError("Enter your password."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          identifier: trimId,
          password:   trimPwd,
          ...(needsSlug && trimSlug ? { schoolSlug: trimSlug } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.requiresSchoolSlug) {
          setNeedsSlug(true);
          setError("Your account is linked to more than one school. Enter your school username to continue.");
          setLoading(false);
          return;
        }
        setNeedsSlug(false);
        setSchoolSlug("");
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }

      // Persist identifier for next visit
      try { sessionStorage.setItem("bidii_login_id", trimId); } catch { /* ignore */ }

      // Hard-navigate so the session cookie is guaranteed to be sent with
      // the very next request. router.push() + router.refresh() together
      // create a race where the refresh cancels the push, leaving the user
      // stuck on the login page with the spinner running forever.
      const dest = nextPath || rolePath(data.role);
      window.location.href = dest;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden
                    bg-gradient-to-br from-teal-50/60 via-white to-slate-50
                    dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]">

      {/* Dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle, #2C7F7E 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      {/* Glow orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-0 dark:opacity-[0.08]"
        style={{ background: "radial-gradient(circle, #2C7F7E, transparent 70%)" }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-teal/10 dark:bg-white/10 ring-1 ring-teal/20 dark:ring-white/20 p-4 mb-5 shadow-md">
            <Image src="/logo.png" alt="Bidii" width={72} height={72} className="object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white tracking-tight">Welcome back</h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1">Sign in to your school account</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />
          <div className="p-7">

            {/* Notices */}
            {notice === "dashboard-not-ready" && (
              <div className="mb-5 rounded-xl bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3">
                That account&apos;s dashboard isn&apos;t available yet.
              </div>
            )}
            {notice === "account-created" && (
              <div className="mb-5 rounded-xl bg-teal/8 border border-teal/20 text-teal text-sm px-4 py-3">
                Account created. Sign in below to continue.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Email / Phone */}
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                  Email or phone number
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@school.com or 07xxxxxxxx"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className={inputClsRight}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate dark:text-dark-muted hover:text-ink dark:hover:text-dark-text transition-colors"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
                  First login? Use your school&apos;s username as the password.
                </p>
              </div>

              {/* School username — only shown when same email exists at multiple schools */}
              {needsSlug && (
                <div>
                  <label htmlFor="schoolSlug" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                    School username
                  </label>
                  <div className="relative">
                    <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                    <input
                      id="schoolSlug"
                      type="text"
                      autoComplete="off"
                      required
                      value={schoolSlug}
                      onChange={(e) => setSchoolSlug(e.target.value)}
                      placeholder="e.g. kianyaga"
                      className={inputCls}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
                    Your school username was shared by your administrator.
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                           shadow-md hover:shadow-lg transition-all duration-150
                           disabled:opacity-60 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2
                           flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        {/* Staff portal shortcut */}
        <div className="mt-5 text-center">
          <Link
            href="/staff-login"
            className="inline-flex items-center gap-1.5 text-xs text-slate dark:text-white/40
                       hover:text-teal dark:hover:text-teal transition-colors group"
          >
            <ShieldCheck className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
            Sign in to the Staff Portal
          </Link>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-4">
          Need help signing in? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}

function rolePath(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":  return "/super-admin";
    case "PRINCIPAL":    return "/principal";
    case "TEACHER":      return "/teacher";
    case "ADMIN_STAFF":  return "/staff";
    default:             return "/login?notice=dashboard-not-ready";
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
