"use client";

/**
 * Set-password page — shown on first parent login when mustChangePassword = true.
 *
 * After a successful `setPassword` server action the action redirects to /parent.
 * This page handles the intermediate "success" state (brief celebration before
 * the redirect fires) and all client-side validation feedback.
 */

import { useState, FormEvent, useTransition } from "react";
import Image from "next/image";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { setPassword } from "./actions";

// ── Shared input class (mirrors /parent-login) ────────────────────────────
const inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-10 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text " +
  "dark:placeholder:text-dark-muted/50";

// ── Password requirements ─────────────────────────────────────────────────
const requirements = [
  { label: "At least 8 characters",   test: (v: string) => v.length >= 8 },
  { label: "Contains a letter",       test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: "Contains a number",       test: (v: string) => /\d/.test(v) },
];

export default function SetPasswordPage() {
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState(false);
  const [isPending,       startTransition]    = useTransition();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Quick client-side pre-check before calling the server action
    if (!newPassword || !confirmPassword) {
      setError("Both password fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const fd = new FormData();
    fd.set("newPassword",     newPassword);
    fd.set("confirmPassword", confirmPassword);

    startTransition(async () => {
      // setPassword either redirects (success) or returns { error }
      // If it returns here we got an error object
      const result = await setPassword(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        // Server action redirected — show success briefly while Next.js
        // processes the redirect
        setSuccess(true);
      }
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden
                 bg-gradient-to-br from-teal-50/60 via-white to-slate-50
                 dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]"
    >
      {/* Dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #2C7F7E 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
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
            <Image
              src="/logo.png"
              alt="Bidii"
              width={72}
              height={72}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white tracking-tight">
            Create Your New Password
          </h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1 text-center max-w-xs">
            Welcome to Bidii 👋 For your security, please create a new password.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div
            className="h-0.5"
            style={{
              background:
                "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)",
            }}
          />
          <div className="p-7">
            {success ? (
              /* ── Success state ─────────────────────────────────────────── */
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                <div className="rounded-full bg-teal/10 p-4">
                  <CheckCircle2 className="h-10 w-10 text-teal" />
                </div>
                <div>
                  <p className="text-base font-semibold text-ink dark:text-white">
                    Password created successfully ✓
                  </p>
                  <p className="text-sm text-slate dark:text-dark-muted mt-1">
                    Your Bidii parent account is now secured.
                  </p>
                </div>
                <a
                  href="/parent"
                  className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                             shadow-md hover:shadow-lg transition-all duration-150
                             flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)",
                  }}
                >
                  Continue to Bidii
                </a>
              </div>
            ) : (
              /* ── Password form ──────────────────────────────────────────── */
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* New Password */}
                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="newPassword"
                      type={showNew ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a password"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate dark:text-dark-muted hover:text-ink dark:hover:text-dark-text transition-colors"
                      aria-label={showNew ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showNew ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Requirements checklist */}
                  <ul className="mt-2 space-y-1">
                    {requirements.map((req) => {
                      const met = newPassword.length > 0 && req.test(newPassword);
                      return (
                        <li
                          key={req.label}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            met
                              ? "text-teal"
                              : "text-slate dark:text-dark-muted"
                          }`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                              met ? "bg-teal" : "bg-slate/40 dark:bg-dark-muted/40"
                            }`}
                          />
                          {req.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate dark:text-dark-muted hover:text-ink dark:hover:text-dark-text transition-colors"
                      aria-label={
                        showConfirm ? "Hide password" : "Show password"
                      }
                      tabIndex={-1}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {/* Inline mismatch hint */}
                  {confirmPassword.length > 0 &&
                    newPassword !== confirmPassword && (
                      <p className="mt-1 text-xs text-danger">
                        Passwords don&apos;t match yet.
                      </p>
                    )}
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                             shadow-md hover:shadow-lg transition-all duration-150
                             disabled:opacity-60 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2
                             flex items-center justify-center gap-2"
                  style={{
                    background:
                      "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)",
                  }}
                >
                  {isPending && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {isPending ? "Creating password…" : "Create Password"}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-5">
          Need help? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}
