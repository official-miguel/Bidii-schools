"use client";

/**
 * Interactive login form for the parent portal.
 *
 * Separated into its own client component so the outer page.tsx can remain
 * a server component (needed to resolve schoolId server-side before render).
 */

import { useState, FormEvent } from "react";
import { Phone, Hash, Eye, EyeOff, Loader2 } from "lucide-react";
import { parentLogin } from "./actions";

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

interface Props {
  schoolId: string;
}

export default function ParentLoginForm({ schoolId }: Props) {
  const [phone, setPhone] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [showAdmission, setShowAdmission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimPhone = phone.trim();
    const trimAdmission = admissionNumber.trim();

    if (!trimPhone) {
      setError("Enter your phone number.");
      return;
    }
    if (!trimAdmission) {
      setError("Enter your child's admission number.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("phone", trimPhone);
      formData.set("admissionNumber", trimAdmission);
      formData.set("schoolId", schoolId);

      const result = await parentLogin(formData);

      // parentLogin redirects on success — if we reach here it returned an error
      if (result?.error) {
        setError(result.error);
      }
    } catch (err) {
      // Next.js redirect() throws an internal NEXT_REDIRECT error — this is
      // the success path; re-throw it so the framework can handle the redirect.
      if (
        err instanceof Error &&
        (err.message === "NEXT_REDIRECT" || err.message.includes("NEXT_REDIRECT"))
      ) {
        throw err;
      }
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Phone Number */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5"
        >
          Phone number
        </label>
        <div className="relative">
          <Phone
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07xxxxxxxx"
            className={inputCls}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
          The phone number registered with the school.
        </p>
      </div>

      {/* Admission Number */}
      <div>
        <label
          htmlFor="admissionNumber"
          className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5"
        >
          Admission number
        </label>
        <div className="relative">
          <Hash
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="admissionNumber"
            name="admissionNumber"
            type={showAdmission ? "text" : "password"}
            autoComplete="off"
            required
            value={admissionNumber}
            onChange={(e) => setAdmissionNumber(e.target.value)}
            placeholder="e.g. 001"
            className={inputClsRight}
          />
          <button
            type="button"
            onClick={() => setShowAdmission((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate dark:text-dark-muted hover:text-ink dark:hover:text-dark-text transition-colors"
            aria-label={
              showAdmission ? "Hide admission number" : "Show admission number"
            }
            tabIndex={-1}
          >
            {showAdmission ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
          Your child&apos;s admission number — used as your initial password.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3"
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className={
          "w-full rounded-xl text-white text-sm font-semibold py-3 mt-1 " +
          "shadow-md hover:shadow-lg transition-all duration-150 " +
          "disabled:opacity-60 disabled:cursor-not-allowed " +
          "focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2 " +
          "flex items-center justify-center gap-2"
        }
        style={{ background: "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}
      >
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
