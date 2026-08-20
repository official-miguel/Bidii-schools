"use client";

/**
 * ForcePasswordChangeModal
 *
 * Non-dismissible modal shown when mustChangePassword === true.
 * Displayed in all role layouts (principal / teacher / staff) as a client
 * wrapper that intercepts the page before the user can interact with it.
 *
 * No "current password" field — the user already authenticated at login.
 * They only need to choose and confirm their new personal password.
 * The API (/api/auth/change-password) guards that the new password cannot
 * equal the school username.
 */

import { useState, FormEvent, useEffect } from "react";
import { Eye, EyeOff, CheckCircle2, XCircle, Lock, ShieldCheck } from "lucide-react";

// ── Password strength helpers ────────────────────────────────────────────────

interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  bgColor: string;
}

function measureStrength(p: string): StrengthResult {
  let score = 0;
  if (p.length >= 8)           score++;
  if (p.length >= 12)          score++;
  if (/[A-Z]/.test(p))         score++;
  if (/[0-9]/.test(p))         score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;

  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const map: Record<number, StrengthResult> = {
    0: { score: 0, label: "Too short", color: "#F04438", bgColor: "bg-danger"  },
    1: { score: 1, label: "Weak",      color: "#F04438", bgColor: "bg-danger"  },
    2: { score: 2, label: "Fair",      color: "#F79009", bgColor: "bg-warn"    },
    3: { score: 3, label: "Good",      color: "#17B26A", bgColor: "bg-success" },
    4: { score: 4, label: "Strong",    color: "#2C7F7E", bgColor: "bg-teal"    },
  };
  return map[s];
}

interface Requirement { label: string; met: boolean; }

function requirements(p: string): Requirement[] {
  return [
    { label: "At least 8 characters", met: p.length >= 8        },
    { label: "One uppercase letter",  met: /[A-Z]/.test(p)      },
    { label: "One number",            met: /[0-9]/.test(p)       },
  ];
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  mustChange: boolean;
}

export default function ForcePasswordChangeModal({ mustChange }: Props) {
  const [visible, setVisible] = useState(mustChange);
  useEffect(() => { setVisible(mustChange); }, [mustChange]);

  const [newPwd,  setNewPwd]  = useState("");
  const [confirm, setConfirm] = useState("");

  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);

  if (!visible) return null;

  const strength       = measureStrength(newPwd);
  const reqs           = requirements(newPwd);
  const allReqsMet     = reqs.every((r) => r.met);
  const passwordsMatch = newPwd === confirm && confirm.length > 0;
  const canSubmit      = allReqsMet && passwordsMatch && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res  = await fetch("/api/auth/change-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ newPassword: newPwd, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        setVisible(false);
        window.location.reload();
      }, 1400);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="force-pwd-title"
    >
      <div className="w-full max-w-md bg-card rounded-2xl border border-line shadow-2xl overflow-hidden animate-scale-in">

        {/* Header */}
        <div className="bg-gradient-to-br from-teal to-teal-dark px-7 py-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white/15 rounded-xl">
              <Lock className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 id="force-pwd-title" className="text-base font-semibold text-white tracking-tight">
                Set your password
              </h1>
              <p className="text-[13px] text-white/70 mt-0.5">
                Choose a personal password to unlock your dashboard
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6">

          {/* Info callout */}
          <div className="flex gap-3 bg-teal-50 border border-teal/20 rounded-xl px-4 py-3 mb-5">
            <ShieldCheck className="h-4 w-4 text-teal mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-teal-dark leading-relaxed">
              You signed in with your school&apos;s username. Create a secure
              personal password — the school username cannot be used again.
            </p>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-success-bg">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <p className="text-sm font-semibold text-ink">Password set successfully!</p>
              <p className="text-xs text-slate">Unlocking your dashboard…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
                  <XCircle className="h-4 w-4 text-danger mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm text-danger leading-relaxed">{error}</p>
                </div>
              )}

              {/* New password */}
              <div>
                <label htmlFor="fp-new" className="block text-sm font-medium text-ink mb-1.5">
                  New password <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="fp-new"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={newPwd}
                    onChange={(e) => { setNewPwd(e.target.value); setError(null); }}
                    placeholder="Choose a strong password"
                    className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink pr-10
                               placeholder:text-slate/50
                               focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15
                               transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink transition-colors"
                    aria-label={showNew ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength meter */}
                {newPwd.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                              strength.score >= level ? strength.bgColor : "bg-line"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium tabular-nums w-14 text-right" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {reqs.map((r) => (
                        <div key={r.label} className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`h-3 w-3 shrink-0 transition-colors ${r.met ? "text-success" : "text-slate/40"}`}
                            aria-hidden="true"
                          />
                          <span className={`text-xs transition-colors ${r.met ? "text-success" : "text-slate"}`}>
                            {r.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="fp-confirm" className="block text-sm font-medium text-ink mb-1.5">
                  Confirm new password <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="fp-confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    placeholder="Re-enter your new password"
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink pr-10
                               placeholder:text-slate/50
                               focus:outline-none focus:ring-2 transition-colors ${
                      confirm.length > 0
                        ? passwordsMatch
                          ? "border-success focus:border-success focus:ring-success/15"
                          : "border-danger focus:border-danger focus:ring-danger/15 bg-danger-bg/30"
                        : "border-line focus:border-teal focus:ring-teal/15"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink transition-colors"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1.5 text-xs text-danger flex items-center gap-1" role="alert">
                    <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Passwords do not match.
                  </p>
                )}
                {confirm.length > 0 && passwordsMatch && (
                  <p className="mt-1.5 text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Passwords match.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-xl bg-teal text-white text-sm font-semibold py-3 mt-1
                           hover:bg-teal-dark active:scale-[0.98] transition-all duration-100
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                           focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2
                           shadow-xs"
              >
                {saving ? "Saving…" : "Set password & continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
