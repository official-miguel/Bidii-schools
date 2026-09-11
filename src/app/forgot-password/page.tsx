"use client";

/**
 * /forgot-password
 *
 * Two-step forgot-password flow:
 *   Step 1 — Enter email/phone + optional school slug (mirrors login UX).
 *   Step 2 — Enter the 6-digit OTP sent to the user's phone.
 *
 * On success, hard-navigates to redirectTo (the user's role dashboard).
 * ForcePasswordChangeModal appears immediately because mustChangePassword
 * is set to true by the verify route, exactly like first-time staff login.
 *
 * Never builds a password-set step — that is entirely handled by the
 * existing ForcePasswordChangeModal + /api/auth/change-password, unchanged.
 */

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams }               from "next/navigation";
import { Logo }                          from "@/components/Logo";
import { Mail, School, Loader2, ArrowLeft, KeyRound } from "lucide-react";

// ── Shared input style (mirrors login/page.tsx) ───────────────────────────────

const inputCls =
  "w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm text-foreground " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors";

// ── Inner form (needs useSearchParams → must be inside Suspense) ──────────────

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const prefill      = searchParams.get("identifier") ?? "";

  // Step 1 state
  const [identifier, setIdentifier] = useState(prefill);
  const [schoolSlug, setSchoolSlug] = useState("");
  const [needsSlug,  setNeedsSlug]  = useState(false);

  // Step 2 state
  const [otp, setOtp] = useState("");

  // Shared state
  const [step,    setStep]    = useState<1 | 2>(1);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Step 1: request OTP ─────────────────────────────────────────────────
  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let trimId = identifier.trim().toLowerCase();
    const trimSlug = schoolSlug.trim().replace(/^@/, "");
    if (!trimId) { setError("Enter your email address or phone number."); return; }

    // Auto-convert 254... to +254... for phone numbers
    if (/^254\d{9}$/.test(trimId)) {
      trimId = `+${trimId}`;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          identifier: trimId,
          ...(needsSlug && trimSlug ? { schoolSlug: trimSlug } : {}),
        }),
      });

      if (res.status === 503) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Service temporarily unavailable. Please try again later.");
        return;
      }

      // For all other outcomes (200 or rate-limited 429) advance to step 2
      // so we never reveal whether the identifier matched an account.
      setStep(2);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ──────────────────────────────────────────────────
  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimOtp  = otp.trim();
    let trimId     = identifier.trim().toLowerCase();
    const trimSlug = schoolSlug.trim().replace(/^@/, "");

    // Auto-convert 254... to +254... for phone numbers
    if (/^254\d{9}$/.test(trimId)) {
      trimId = `+${trimId}`;
    }

    if (trimOtp.length !== 6 || !/^\d{6}$/.test(trimOtp)) {
      setError("Enter the 6-digit code sent to your phone.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          identifier: trimId,
          otp:        trimOtp,
          ...(trimSlug ? { schoolSlug: trimSlug } : {}),
        }),
      });
      const data = await res.json() as { ok?: boolean; redirectTo?: string; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Invalid or expired code. Check and try again.");
        return;
      }

      // Hard navigate — session cookie must be sent on the very next request
      window.location.href = data.redirectTo ?? "/login";
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden
                    bg-gradient-to-br from-teal-50/60 via-white to-slate-50
                    dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]">

      {/* Dot grid (mirrors login page) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle, #2C7F7E 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-teal/10 dark:bg-card/10 ring-1 ring-teal/20 dark:ring-white/20 p-4 mb-5 shadow-md">
            <Logo height={72} width={72} alt="Bidii" className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white tracking-tight">
            {step === 1 ? "Reset your password" : "Enter your code"}
          </h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1 text-center px-4">
            {step === 1
              ? "We'll send a one-time code to your registered phone number."
              : `A 6-digit code was sent to the phone number on your account.`}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />
          <div className="p-7">

            {/* ── Step 1 ── */}
            {step === 1 && (
              <form onSubmit={handleRequest} className="space-y-4" noValidate>

                {/* Identifier */}
                <div>
                  <label htmlFor="fp-identifier" className="block text-sm font-medium text-foreground mb-1.5">
                    Email or phone number
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden="true" />
                    <input
                      id="fp-identifier"
                      type="text"
                      autoComplete="username"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@school.com or 254712345678"
                      className={inputCls}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate">
                    For phone numbers, use format: 254712345678 (starts with 254)
                  </p>
                </div>

                {/* School slug — shown when same email/phone maps to >1 school */}
                {needsSlug && (
                  <div>
                    <label htmlFor="fp-slug" className="block text-sm font-medium text-foreground mb-1.5">
                      School username
                    </label>
                    <div className="relative">
                      <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden="true" />
                      <input
                        id="fp-slug"
                        type="text"
                        autoComplete="off"
                        required
                        value={schoolSlug}
                        onChange={(e) => setSchoolSlug(e.target.value)}
                        placeholder="e.g. kianyaga"
                        className={inputCls}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate">
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
                  {loading ? "Sending…" : "Send code"}
                </button>
              </form>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <form onSubmit={handleVerify} className="space-y-4" noValidate>

                {/* OTP input */}
                <div>
                  <label htmlFor="fp-otp" className="block text-sm font-medium text-foreground mb-1.5">
                    6-digit code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden="true" />
                    <input
                      id="fp-otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      className={inputCls}
                      autoFocus
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate">
                    Code expires in 10 minutes. Check your phone.
                  </p>
                </div>

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
                  {loading ? "Verifying…" : "Verify code"}
                </button>

                {/* Back to step 1 */}
                <button
                  type="button"
                  onClick={() => { setStep(1); setOtp(""); setError(null); }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-slate hover:text-foreground transition-colors pt-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Use a different account
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-4">
          <a href="/login" className="hover:text-teal transition-colors">
            ← Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
