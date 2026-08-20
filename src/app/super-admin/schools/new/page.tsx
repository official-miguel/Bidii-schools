"use client";

/**
 * /super-admin/schools/new — School Onboarding form
 *
 * Creates a new school + first PRINCIPAL user in one transaction.
 * Plan tier selector auto-shows the module bundle for that tier.
 * On success → redirects to the new school's detail page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link          from "next/link";
import { ChevronLeft, Building2, User, Shield, CheckCircle2 } from "lucide-react";
import {
  PageHeader, Card, FormField, FormGrid,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
  ErrorBanner,
} from "@/components/ui";

const PLAN_TIERS = ["FREE", "STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE"] as const;
type PlanTier = (typeof PLAN_TIERS)[number];

const PLAN_BUNDLES: Record<PlanTier, string[]> = {
  FREE:         ["Attendance"],
  STARTER:      ["Attendance", "Grading", "Reports", "Import Tool"],
  GROWTH:       ["Attendance", "Grading", "Reports", "Import Tool", "Messaging", "Library", "Timetable"],
  PROFESSIONAL: ["Attendance", "Grading", "Reports", "Import Tool", "Messaging", "Library",
                 "Timetable", "Fee Management", "Accommodation", "Analytics"],
  ENTERPRISE:   ["Attendance", "Grading", "Reports", "Import Tool", "Messaging", "Library",
                 "Timetable", "Fee Management", "Accommodation", "Analytics", "AI Tools", "Transport"],
};

const PLAN_COLORS: Record<PlanTier, string> = {
  FREE:         "bg-slate-100 text-slate border-line",
  STARTER:      "bg-teal-50 text-teal border-teal/20",
  GROWTH:       "bg-info-bg text-info border-info/20",
  PROFESSIONAL: "bg-warn-bg text-warn border-warn/20",
  ENTERPRISE:   "bg-danger-bg text-danger border-danger/20",
};

const DEFAULT_QUOTAS: Record<PlanTier, number> = {
  FREE: 2, STARTER: 5, GROWTH: 15, PROFESSIONAL: 50, ENTERPRISE: 200,
};

function generateSlug(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function SchoolOnboardingPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name:           "",
    address:        "",
    contactPerson:  "",
    contactEmail:   "",
    contactPhone:   "",
    planTier:       "STARTER" as PlanTier,
    storageQuotaGb: 5,
    slug:           "",
    adminName:      "",
    adminEmail:     "",
    tempPassword:   generateTempPassword(),
  });

  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);

  function set(key: keyof typeof form, value: string | number) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleNameChange(v: string) {
    set("name", v);
    if (!form.slug) set("slug", generateSlug(v));
  }

  function handlePlanChange(tier: PlanTier) {
    set("planTier", tier);
    set("storageQuotaGb", DEFAULT_QUOTAS[tier]);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim())          e.name          = "School name is required";
    if (!form.contactPerson.trim()) e.contactPerson  = "Contact person is required";
    if (!form.contactEmail.trim())  e.contactEmail   = "Contact email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) e.contactEmail = "Invalid email";
    if (!form.adminName.trim())     e.adminName      = "Admin name is required";
    if (!form.adminEmail.trim())    e.adminEmail     = "Admin email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail))   e.adminEmail = "Invalid email";
    if (!form.tempPassword || form.tempPassword.length < 8) e.tempPassword = "Minimum 8 characters";
    if (form.slug && !/^[a-z0-9-]+$/.test(form.slug)) e.slug = "Only lowercase letters, numbers, and hyphens";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) { setErrors(v); return; }

    setSaving(true); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/schools", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message ?? j.error ?? "Failed to create school");
      setDone(true);
      setTimeout(() => router.push(`/super-admin/schools/${j.school.id}`), 1500);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Failed to create school");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 animate-fade-in">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-success-bg">
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2} />
        </div>
        <p className="text-lg font-semibold text-ink dark:text-dark-text">School created!</p>
        <p className="text-sm text-slate dark:text-dark-muted">Redirecting to school details…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Back link */}
      <Link
        href="/super-admin/schools"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink dark:text-dark-muted
                   dark:hover:text-dark-text transition-colors"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to Schools
      </Link>

      <PageHeader
        title="Onboard New School"
        description="Create a school account and provision the first admin login."
      />

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* ── School info ───────────────────────────────────────────── */}
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-line dark:border-dark-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-50">
              <Building2 className="h-4 w-4 text-teal" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">School Information</h2>
          </div>

          <div className="space-y-4">
            <FormGrid cols={2}>
              <FormField label="School Name" required error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Greenhill Academy"
                  className={inputClass}
                />
              </FormField>
              <FormField label="URL Slug" helper="Auto-generated from name. Lowercase, no spaces." error={errors.slug}>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => set("slug", e.target.value)}
                  placeholder="greenhill-academy"
                  className={inputClass}
                />
              </FormField>
            </FormGrid>

            <FormField label="Address">
              <input
                type="text"
                value={form.address}
                onChange={e => set("address", e.target.value)}
                placeholder="123 School Road, Nairobi"
                className={inputClass}
              />
            </FormField>

            <FormGrid cols={2}>
              <FormField label="Contact Person" required error={errors.contactPerson}>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={e => set("contactPerson", e.target.value)}
                  placeholder="Dr. Jane Mwangi"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Contact Phone">
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={e => set("contactPhone", e.target.value)}
                  placeholder="+254 700 000 000"
                  className={inputClass}
                />
              </FormField>
            </FormGrid>

            <FormField label="Contact Email" required error={errors.contactEmail}>
              <input
                type="email"
                value={form.contactEmail}
                onChange={e => set("contactEmail", e.target.value)}
                placeholder="admin@greenhill.ac.ke"
                className={inputClass}
              />
            </FormField>
          </div>
        </Card>

        {/* ── Plan tier ─────────────────────────────────────────────── */}
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-line dark:border-dark-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-warn-bg">
              <Shield className="h-4 w-4 text-warn" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">Plan &amp; Quota</h2>
          </div>

          {/* Plan tier selector */}
          <div className="space-y-3">
            <label className={labelClass}>Plan Tier <span className="text-danger ml-1">*</span></label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PLAN_TIERS.map(tier => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => handlePlanChange(tier)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-semibold
                              transition-all duration-100
                              ${form.planTier === tier
                                ? "border-teal bg-teal-50 text-teal shadow-sm"
                                : "border-line hover:border-teal/40 text-slate"
                              }`}
                >
                  {tier}
                </button>
              ))}
            </div>

            {/* Module bundle preview */}
            <div className="rounded-lg bg-paper dark:bg-dark-bg border border-line dark:border-dark-border p-3">
              <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">
                Included modules
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PLAN_BUNDLES[form.planTier].map(m => (
                  <span
                    key={m}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium
                                ${PLAN_COLORS[form.planTier]}`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Storage quota */}
            <FormField
              label="Initial Storage Quota (GB)"
              helper={`Default for ${form.planTier}: ${DEFAULT_QUOTAS[form.planTier]} GB`}
            >
              <input
                type="number"
                min={1}
                max={2000}
                value={form.storageQuotaGb}
                onChange={e => set("storageQuotaGb", parseInt(e.target.value, 10) || 5)}
                className={inputClass}
              />
            </FormField>
          </div>
        </Card>

        {/* ── First admin account ───────────────────────────────────── */}
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-line dark:border-dark-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-success-bg">
              <User className="h-4 w-4 text-success" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">First School Admin (Principal)</h2>
          </div>

          <div className="space-y-4">
            <FormGrid cols={2}>
              <FormField label="Full Name" required error={errors.adminName}>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={e => set("adminName", e.target.value)}
                  placeholder="Dr. Jane Mwangi"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Email Address" required error={errors.adminEmail}>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={e => set("adminEmail", e.target.value)}
                  placeholder="principal@greenhill.ac.ke"
                  className={inputClass}
                />
              </FormField>
            </FormGrid>

            <FormField
              label="Temporary Password"
              required
              error={errors.tempPassword}
              helper="Share this directly with the principal. They will be prompted to change it on first login."
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.tempPassword}
                  onChange={e => set("tempPassword", e.target.value)}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => set("tempPassword", generateTempPassword())}
                  className={`${secondaryButtonClass} shrink-0 px-3`}
                  title="Generate new password"
                >
                  ↻
                </button>
              </div>
            </FormField>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/super-admin/schools" className={secondaryButtonClass}>
            Cancel
          </Link>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? "Creating…" : "Create School"}
          </button>
        </div>
      </form>
    </div>
  );
}
