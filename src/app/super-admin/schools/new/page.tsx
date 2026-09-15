"use client";

/**
 * /super-admin/schools/new — School Onboarding form
 *
 * Creates a new school + first PRINCIPAL user in one transaction.
 * Optional modules (Library, Finance, Accommodation) start switched on and
 * can be left off here; everything else is core and always included.
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

const OPTIONAL_MODULES = [
  { id: "LIBRARY",       label: "Library",       description: "Catalogue, cards, borrowing, and fines" },
  { id: "FEES",          label: "Finance",       description: "Fee structures, invoicing, and payments" },
  { id: "ACCOMMODATION", label: "Accommodation", description: "Dormitories, beds, and boarding allocations" },
] as const;

type OptionalModuleId = (typeof OPTIONAL_MODULES)[number]["id"];

function generateSlug(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function SchoolOnboardingPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name:           "",
    address:        "",
    contactPerson:  "",
    contactEmail:   "",
    contactPhone:   "",
    modules:        OPTIONAL_MODULES.map(m => m.id) as OptionalModuleId[],
    storageQuotaGb: 5,
    slug:           "",
    adminName:      "",
    adminEmail:     "",
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

  function toggleModule(id: OptionalModuleId) {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(id)
        ? f.modules.filter(m => m !== id)
        : [...f.modules, id],
    }));
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
        <p className="text-lg font-semibold text-foreground">School created!</p>
        <p className="text-sm text-slate">Redirecting to school details…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Back link */}
      <Link
        href="/super-admin/schools"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-foreground
                   transition-colors"
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
        <Card className="">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-50">
              <Building2 className="h-4 w-4 text-teal" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-foreground">School Information</h2>
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

        {/* ── Modules & quota ───────────────────────────────────────── */}
        <Card className="">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-warn-bg">
              <Shield className="h-4 w-4 text-warn" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Modules &amp; Storage</h2>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>Optional modules</label>
            <p className="text-xs text-slate -mt-1.5">
              Everything else is included for every school. These three can be turned
              off now or at any time from Module Management.
            </p>

            <div className="grid gap-2 sm:grid-cols-3">
              {OPTIONAL_MODULES.map(mod => {
                const on = form.modules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleModule(mod.id)}
                    className={`flex flex-col items-start gap-1.5 rounded-xl border-2 px-3.5 py-3 text-left
                                transition-all duration-100
                                ${on
                                  ? "border-teal bg-teal-50 shadow-sm"
                                  : "border-border hover:border-teal/40"
                                }`}
                  >
                    <span className="flex items-center justify-between w-full gap-2">
                      <span className={`text-sm font-semibold ${on ? "text-teal" : "text-slate"}`}>
                        {mod.label}
                      </span>
                      <span
                        aria-hidden
                        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                                    transition-colors duration-200 ${on ? "bg-teal" : "bg-line"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-card shadow
                                      transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0"}`}
                        />
                      </span>
                    </span>
                    <span className="text-[11px] leading-snug text-slate">{mod.description}</span>
                  </button>
                );
              })}
            </div>

            {/* Storage quota */}
            <FormField
              label="Initial Storage Quota (GB)"
              helper="Applies to uploaded documents, media, and generated reports."
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
        <Card className="">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-border">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-success-bg">
              <User className="h-4 w-4 text-success" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-foreground">First School Admin (Principal)</h2>
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
              label="Initial Password (School Slug)"
              required
              helper="The principal will use the school slug as their initial password. They will be prompted to change it on first login."
            >
              <input
                type="text"
                value={form.slug}
                readOnly
                disabled
                className={`${inputClass} font-mono bg-slate-50`}
              />
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
