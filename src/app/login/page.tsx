"use client";

/**
 * Login page — Supabase Email OTP flow.
 *
 * Step 1: user enters email → POST /api/auth/otp/request
 * Step 2: user enters 6-digit code → POST /api/auth/otp/verify
 *         → server creates session cookie → redirect to dashboard
 *
 * Per-school email model is preserved: same email can exist at multiple
 * schools. When OTP verify returns requiresSchoolSlug=true the user sees
 * a school identifier field to disambiguate.
 */

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Mail, Hash, School, ArrowLeft, Loader2 } from "lucide-react";

const STORAGE_KEY = "bidii_otp_email";

const inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

// ── Step 1: email entry ───────────────────────────────────────────────────────

function EmailStep({
  onCodeSent,
}: {
  onCodeSent: (email: string) => void;
}) {
  const params = useSearchParams();
  const notice = params.get("notice");

  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore last-used email from sessionStorage.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setEmail(saved);
    } catch { /* ignore */ }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter your email address."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/otp/request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't send the code. Try again."); return; }
      try { sessionStorage.setItem(STORAGE_KEY, trimmed); } catch { /* ignore */ }
      onCodeSent(trimmed);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {notice === "dashboard-not-ready" && (
        <div className="mb-5 rounded-xl bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3">
          That account&apos;s dashboard isn&apos;t available yet.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.com" className={inputCls}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
            We&apos;ll send a 6-digit code to this address.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                     shadow-md hover:shadow-lg transition-all duration-150
                     disabled:opacity-60 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2
                     flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading ? "Sending code…" : "Send code"}
        </button>
      </form>
    </>
  );
}

// ── Step 2: code + optional school slug ──────────────────────────────────────

function CodeStep({
  email,
  onBack,
}: {
  email:  string;
  onBack: () => void;
}) {
  const router = useRouter();

  const [token,      setToken]      = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [needsSlug,  setNeedsSlug]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [resending,  setResending]  = useState(false);
  const [resendMsg,  setResendMsg]  = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedToken = token.trim().replace(/\s/g, "");
    if (trimmedToken.length !== 6) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email,
          token:      trimmedToken,
          schoolSlug: needsSlug ? schoolSlug.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.requiresSchoolSlug) {
          setNeedsSlug(true);
          setError(data.error || "Please enter your school identifier.");
          return;
        }
        setNeedsSlug(false);
        setSchoolSlug("");
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      // Redirect based on role returned by verify endpoint.
      if      (data.role === "PRINCIPAL")   router.push("/principal");
      else if (data.role === "TEACHER")     router.push("/teacher");
      else if (data.role === "ADMIN_STAFF") router.push("/staff");
      else                                  router.push("/login?notice=dashboard-not-ready");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendMsg(null);
    setResending(true);
    try {
      const res  = await fetch("/api/auth/otp/request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      setResendMsg(res.ok ? "A new code has been sent." : (data.error || "Couldn't resend. Try again."));
    } catch {
      setResendMsg("Couldn't reach the server. Try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {/* Back button */}
      <button
        type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate dark:text-dark-muted hover:text-ink dark:hover:text-dark-text transition-colors mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Change email
      </button>

      {/* Sent-to notice */}
      <div className="mb-5 rounded-xl bg-teal/8 border border-teal/20 dark:bg-teal/10 px-4 py-3 text-sm text-teal dark:text-teal-300">
        Code sent to <strong>{email}</strong>. Check your inbox (and spam folder).
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* OTP code */}
        <div>
          <label htmlFor="token" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
            6-digit code
          </label>
          <div className="relative">
            <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="token" type="text" inputMode="numeric" pattern="\d{6}"
              maxLength={6} required autoComplete="one-time-code"
              value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              placeholder="123456" className={inputCls}
            />
          </div>
        </div>

        {/* School identifier — only shown when same email exists at multiple schools */}
        {needsSlug && (
          <div>
            <label htmlFor="schoolSlug" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
              School identifier
            </label>
            <div className="relative">
              <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
              <input
                id="schoolSlug" type="text" required autoComplete="off"
                value={schoolSlug} onChange={(e) => setSchoolSlug(e.target.value)}
                placeholder="e.g. greenwood-primary" className={inputCls}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
              Your school identifier was provided by your administrator.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
            {error}
          </div>
        )}
        {resendMsg && (
          <div role="status" className="rounded-xl bg-teal/8 border border-teal/20 text-teal text-sm px-4 py-3">
            {resendMsg}
          </div>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-xl text-white text-sm font-semibold py-3
                     shadow-md hover:shadow-lg transition-all duration-150
                     disabled:opacity-60 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2
                     flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading ? "Verifying…" : "Sign in"}
        </button>
      </form>

      {/* Resend */}
      <p className="text-center text-sm text-slate dark:text-dark-muted mt-4">
        Didn&apos;t receive a code?{" "}
        <button
          type="button" onClick={handleResend} disabled={resending}
          className="text-teal dark:text-teal-300 font-semibold hover:underline disabled:opacity-50 transition-colors"
        >
          {resending ? "Sending…" : "Resend"}
        </button>
      </p>
    </>
  );
}

// ── Root login page ───────────────────────────────────────────────────────────

function LoginForm() {
  const [step,  setStep]  = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  function handleCodeSent(sentTo: string) {
    setEmail(sentTo);
    setStep("code");
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
          <p className="text-slate dark:text-white/50 text-sm mt-1">
            {step === "email" ? "Sign in to your school account" : "Enter the code we sent you"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />
          <div className="p-7">
            {step === "email" ? (
              <EmailStep onCodeSent={handleCodeSent} />
            ) : (
              <CodeStep email={email} onBack={() => setStep("email")} />
            )}
          </div>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-6">
          New school?{" "}
          <a href="/signup" className="text-teal dark:text-[#3A9998] font-semibold hover:underline transition-colors">
            Create your account
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
