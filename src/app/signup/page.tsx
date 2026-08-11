"use client";

/**
 * Signup page — OTP-only account creation.
 * No password fields. After signup the principal signs in via OTP.
 */

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { School, MapPin, Phone, User, Mail, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

const inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink " +
  "placeholder:text-slate/50 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "transition-colors dark:bg-dark-surface dark:border-dark-border " +
  "dark:text-dark-text dark:placeholder:text-dark-muted/50";

const labelCls        = "block text-sm font-medium text-ink dark:text-dark-text mb-1.5";
const sectionTitleCls = "text-xs font-semibold uppercase tracking-wide text-slate dark:text-dark-muted mb-3";

const DRAFT_DEFAULTS = {
  schoolEmail:    "",
  schoolName:     "",
  schoolAddress:  "",
  schoolPhone:    "",
  fullName:       "",
  principalEmail: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [draft, setDraft, clearDraft] = useFormDraft("bidii_draft_signup_v3", DRAFT_DEFAULTS);

  const [schoolEmail,    setSchoolEmail]    = useState(draft.schoolEmail);
  const [schoolName,     setSchoolName]     = useState(draft.schoolName);
  const [schoolAddress,  setSchoolAddress]  = useState(draft.schoolAddress);
  const [schoolPhone,    setSchoolPhone]    = useState(draft.schoolPhone);
  const [fullName,       setFullName]       = useState(draft.fullName);
  const [principalEmail, setPrincipalEmail] = useState(draft.principalEmail);

  // School detection
  const [schoolExists,           setSchoolExists]           = useState<boolean | null>(null);
  const [existingSchoolName,     setExistingSchoolName]     = useState("");
  const [activePrincipalBlocked, setActivePrincipalBlocked] = useState(false);
  const [checkingSchool,         setCheckingSchool]         = useState(false);

  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lastCheckedEmail = useRef("");

  useEffect(() => {
    setDraft({ schoolEmail, schoolName, schoolAddress, schoolPhone, fullName, principalEmail });
  }, [schoolEmail, schoolName, schoolAddress, schoolPhone, fullName, principalEmail, setDraft]);

  async function checkSchoolEmail(email: string) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || trimmed === lastCheckedEmail.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

    lastCheckedEmail.current = trimmed;
    setCheckingSchool(true);
    setSchoolExists(null);
    setActivePrincipalBlocked(false);

    try {
      const res  = await fetch(`/api/auth/signup/check-school?email=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json() as { exists: boolean; schoolName?: string; activePrincipal?: boolean };
        setSchoolExists(data.exists);
        if (data.exists) {
          setExistingSchoolName(data.schoolName ?? "");
          setActivePrincipalBlocked(data.activePrincipal ?? false);
        }
      }
    } catch { /* non-fatal */ }
    finally { setCheckingSchool(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (activePrincipalBlocked) return;

    if (principalEmail.trim().toLowerCase() === schoolEmail.trim().toLowerCase()) {
      setError("Your personal login email must be different from the school email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          schoolEmail, schoolName, schoolAddress, schoolPhone, fullName, principalEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PRINCIPAL_ALREADY_EXISTS") setActivePrincipalBlocked(true);
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      clearDraft();
      // Signup creates the account but doesn't log in automatically —
      // redirect to login so the principal authenticates via OTP.
      router.push("/login?notice=account-created");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const isNewSchool      = schoolExists === false;
  const isExistingSchool = schoolExists === true;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden
                    bg-gradient-to-br from-teal-50/60 via-white to-slate-50
                    dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]">

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle, #2C7F7E 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div aria-hidden="true" className="pointer-events-none absolute top-1/4 right-1/4 w-96 h-96 rounded-full opacity-0 dark:opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #2C7F7E, transparent 70%)" }} />

      <div className="w-full max-w-md relative z-10">

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-teal/10 dark:bg-white/10 ring-1 ring-teal/20 dark:ring-white/20 p-4 mb-5 shadow-md">
            <Image src="/logo.png" alt="Bidii" width={72} height={72} className="object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white tracking-tight">
            {isExistingSchool && !activePrincipalBlocked ? "Join your school" : "Create your school"}
          </h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1">
            {isExistingSchool && !activePrincipalBlocked
              ? `Registering as Principal of ${existingSchoolName}`
              : "Set up Bidii for your school — you will be the first Principal."}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />

          <div className="p-7">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>

              {/* ── School identity ── */}
              <div>
                <p className={sectionTitleCls}>School identity</p>
                <div className="space-y-3">

                  {/* School email */}
                  <div>
                    <label htmlFor="schoolEmail" className={labelCls}>School email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                      <input
                        id="schoolEmail" type="email" required autoComplete="organization-email"
                        value={schoolEmail}
                        onChange={(e) => { setSchoolEmail(e.target.value); setSchoolExists(null); setActivePrincipalBlocked(false); }}
                        onBlur={(e) => checkSchoolEmail(e.target.value)}
                        placeholder="info@greenhill.ac.ke"
                        className={`${inputCls} ${checkingSchool ? "opacity-70" : ""}`}
                      />
                      {checkingSchool && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
                      )}
                      {isNewSchool && !checkingSchool && (
                        <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-success pointer-events-none" />
                      )}
                    </div>
                    <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
                      The school&apos;s permanent institutional email — used to identify the school and send staff credentials. Never used for login.
                    </p>
                  </div>

                  {/* Existing school banner */}
                  {isExistingSchool && !activePrincipalBlocked && (
                    <div className="flex items-start gap-3 rounded-xl bg-teal/8 border border-teal/20 dark:bg-teal/10 px-4 py-3">
                      <Info className="h-4 w-4 text-teal mt-0.5 shrink-0" aria-hidden="true" />
                      <p className="text-sm text-teal dark:text-teal-light">
                        <strong>{existingSchoolName}</strong> is already registered. You&apos;re joining as the incoming Principal.
                      </p>
                    </div>
                  )}

                  {/* Blocked banner */}
                  {activePrincipalBlocked && (
                    <div className="flex items-start gap-3 rounded-xl bg-warn-bg border border-warn/20 px-4 py-3">
                      <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" aria-hidden="true" />
                      <p className="text-sm text-warn">
                        This school already has an active Principal. They must transfer or deactivate their account before you can register.
                      </p>
                    </div>
                  )}

                  {/* School name — new schools only */}
                  {(isNewSchool || schoolExists === null) && (
                    <div>
                      <label htmlFor="schoolName" className={labelCls}>School name</label>
                      <div className="relative">
                        <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                        <input id="schoolName" required={isNewSchool} value={schoolName}
                          onChange={(e) => setSchoolName(e.target.value)} className={inputCls} placeholder="Green Hill Academy" />
                      </div>
                    </div>
                  )}

                  {/* Address + phone — new schools only */}
                  {(isNewSchool || schoolExists === null) && (
                    <>
                      <div>
                        <label htmlFor="schoolAddress" className={labelCls}>
                          Address <span className="text-slate/60 font-normal dark:text-dark-muted/60">(optional)</span>
                        </label>
                        <div className="relative">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                          <input id="schoolAddress" value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} className={inputCls} placeholder="P.O. Box 123, Nairobi" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="schoolPhone" className={labelCls}>
                          School phone <span className="text-slate/60 font-normal dark:text-dark-muted/60">(optional)</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                          <input id="schoolPhone" value={schoolPhone} onChange={(e) => setSchoolPhone(e.target.value)} className={inputCls} placeholder="+254 7xx xxx xxx" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Principal login ── */}
              {!activePrincipalBlocked && (
                <div>
                  <p className={sectionTitleCls}>Your Principal login</p>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="fullName" className={labelCls}>Your full name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                        <input id="fullName" required value={fullName}
                          onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Jane Wanjiru" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="principalEmail" className={labelCls}>Your personal email</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                        <input id="principalEmail" type="email" required autoComplete="email"
                          value={principalEmail} onChange={(e) => setPrincipalEmail(e.target.value)}
                          placeholder="jane@gmail.com" className={inputCls} />
                      </div>
                      <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
                        Your personal login email — different from the school email. You&apos;ll sign in with a code sent here.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
                  {error}
                </div>
              )}

              {!activePrincipalBlocked && (
                <button type="submit" disabled={loading || checkingSchool}
                  className="w-full rounded-xl text-white text-sm font-semibold py-3 transition-all duration-150 shadow-lg
                             disabled:opacity-60 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2"
                  style={{ background: (loading || checkingSchool) ? "#2C7F7E" : "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}
                >
                  {loading
                    ? (isExistingSchool ? "Joining school…" : "Creating your school…")
                    : (isExistingSchool ? "Join as Principal" : "Create school account")}
                </button>
              )}

            </form>
          </div>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-teal dark:text-[#3A9998] font-semibold hover:underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
