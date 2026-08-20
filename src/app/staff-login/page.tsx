"use client";

/**
 * Staff Login Portal — /staff-login
 *
 * Dedicated sign-in page for ADMIN_STAFF users.
 * Uses the same /api/auth/login endpoint as the general login but enforces
 * that only ADMIN_STAFF accounts can proceed. Any other role that successfully
 * authenticates is rejected with a clear message here (the session is not
 * created client-side; the server sets the cookie, so we immediately call
 * logout to clean up and show an error).
 *
 * First-login flow:
 *   Initial password = school slug (e.g. "kianyaga").
 *   mustChangePassword=true → redirects to /staff with the change-password gate.
 *
 * Per-school email:
 *   Same email at two schools → requiresSchoolSlug=true → school slug field appears.
 */

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Mail,
  Lock,
  School,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

// ── Shared input styles ───────────────────────────────────────────────────────

const _inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

const _inputClsRight =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-10 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

// ── Main form component ───────────────────────────────────────────────────────

function StaffLoginForm() {
  const _router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [schoolSlug, setSchoolSlug] = useState("");
  const [needsSlug, setNeedsSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill identifier from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bidii_staff_login_id");
      if (saved) setIdentifier(saved);
    } catch {
      /* ignore */
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimId = identifier.trim().toLowerCase();
    const trimPwd = password.trim();
    const trimSlug = schoolSlug.trim().replace(/^@/, "");

    if (!trimId) {
      setError("Enter your email address.");
      return;
    }
    if (!trimPwd) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: trimId,
          password: trimPwd,
          ...(needsSlug && trimSlug ? { schoolSlug: trimSlug } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.requiresSchoolSlug) {
          setNeedsSlug(true);
          setError(
            "Your account is linked to more than one school. Enter your school username to continue."
          );
          setLoading(false);
          return;
        }
        setNeedsSlug(false);
        setSchoolSlug("");
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }

      // ── Role guard — only ADMIN_STAFF may use this portal ────────────────
      if (data.role !== "ADMIN_STAFF") {
        // The server already set the session cookie — destroy it immediately.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        setError(
          "This portal is for staff accounts only. Please use the correct sign-in page for your role."
        );
        setLoading(false);
        return;
      }

      // Persist for next visit
      try {
        sessionStorage.setItem("bidii_staff_login_id", trimId);
      } catch {
        /* ignore */
      }

      // Hard-navigate so the session cookie is guaranteed to be sent with
      // the very next request. router.push() + router.refresh() together
      // create a race where the refresh cancels the push.
      const dest = nextPath?.startsWith("/staff") ? nextPath : "/staff";
      window.location.href = dest;
    } catch {
      setError(
        "Couldn\u2019t reach the server. Check your connection and try again."
      );
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #1e3a5f 100%)",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #818cf8 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Glow blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-120px] right-[-80px] w-[480px] h-[480px] rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, #6366f1 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-100px] left-[-60px] w-[380px] h-[380px] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Back link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-indigo-200/70 hover:text-white text-xs mb-7 transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to general sign-in
        </Link>

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-white/10 ring-1 ring-white/20 p-4 mb-5 shadow-xl backdrop-blur-sm">
            <Image
              src="/logo.png"
              alt="Bidii"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>

          {/* Staff badge */}
          <div className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-medium px-3 py-1 rounded-full mb-3">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Staff Portal
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            Staff Sign In
          </h1>
          <p className="text-indigo-200/60 text-sm mt-1">
            Access your school staff dashboard
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.08] backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15">
          {/* Top accent bar */}
          <div
            className="h-0.5"
            style={{
              background:
                "linear-gradient(90deg, #6366f1, #818cf8, #6366f1)",
            }}
          />

          <div className="p-7">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Email */}
              <div>
                <label
                  htmlFor="staff-identifier"
                  className="block text-sm font-medium text-white/80 mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300/60 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="staff-identifier"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="staff@school.com"
                    className={
                      "w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-4 py-3 text-sm text-white " +
                      "placeholder:text-white/30 " +
                      "focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25 " +
                      "hover:border-white/20 transition-colors backdrop-blur-sm"
                    }
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-sm font-medium text-white/80 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300/60 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="staff-password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className={
                      "w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-10 py-3 text-sm text-white " +
                      "placeholder:text-white/30 " +
                      "focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25 " +
                      "hover:border-white/20 transition-colors backdrop-blur-sm"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-300/50 hover:text-white transition-colors"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-indigo-200/50">
                  First login? Use your school&apos;s username as the password.
                </p>
              </div>

              {/* School username — only when multi-school conflict */}
              {needsSlug && (
                <div>
                  <label
                    htmlFor="staff-school-slug"
                    className="block text-sm font-medium text-white/80 mb-1.5"
                  >
                    School username
                  </label>
                  <div className="relative">
                    <School
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300/60 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="staff-school-slug"
                      type="text"
                      autoComplete="off"
                      required
                      value={schoolSlug}
                      onChange={(e) => setSchoolSlug(e.target.value)}
                      placeholder="e.g. kianyaga"
                      className={
                        "w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-4 py-3 text-sm text-white " +
                        "placeholder:text-white/30 " +
                        "focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25 " +
                        "hover:border-white/20 transition-colors backdrop-blur-sm"
                      }
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-indigo-200/50">
                    Your school username was shared by your administrator.
                  </p>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-500/15 border border-red-400/25 text-red-200 text-sm px-4 py-3"
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                           shadow-lg hover:shadow-xl transition-all duration-150
                           disabled:opacity-60 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:ring-offset-2 focus:ring-offset-transparent
                           flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                }}
              >
                {loading && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {loading ? "Signing in\u2026" : "Sign in to Staff Portal"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-indigo-200/40 mt-6">
          Need access? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function StaffLoginPage() {
  return (
    <Suspense fallback={null}>
      <StaffLoginForm />
    </Suspense>
  );
}
