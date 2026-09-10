"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  Settings, BedDouble, Users, BarChart3,
  ShieldCheck, ArrowRight, CheckCircle2, ExternalLink,
} from "lucide-react";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, FormField,
} from "@/components/ui";
import Link from "next/link";
import ContextNavigation from "@/components/ContextNavigation";

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",    label: "Overview", exact: true },
  { href: "/principal/accommodation/dormitories", label: "Dormitories" },
  { href: "/principal/accommodation/allocations", label: "Allocations" },
  { href: "/principal/accommodation/settings",    label: "Settings" },
];

interface AccomSettings {
  enableDormCaptains: boolean;
  enableTransfers: boolean;
  defaultAllocationPolicy: string;
  occupancyWarningPct: number;
  bedTrackingEnabled: boolean;
  analyticsEnabled: boolean;
  notifyOnAllocation: boolean;
  updatedAt: string | null;
}

// These two are owned by /api/school/settings, shown read-only here.
interface SchoolPolicy {
  boardingType: string;
  genderPolicy: string;
}

const BOARDING_LABEL: Record<string, string> = {
  DAY_ONLY:        "Day School Only",
  DAY_AND_BOARDING:"Day & Boarding",
  BOARDING_ONLY:   "Boarding Only",
};
const GENDER_POLICY_LABEL: Record<string, string> = {
  MIXED:      "Mixed Gender",
  BOYS_ONLY:  "Boys Only",
  GIRLS_ONLY: "Girls Only",
};

const DEFAULT: AccomSettings = {
  enableDormCaptains: true, enableTransfers: true,
  defaultAllocationPolicy: "MIXED_FORMS", occupancyWarningPct: 90,
  bedTrackingEnabled: true, analyticsEnabled: true, notifyOnAllocation: false,
  updatedAt: null,
};

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-slate mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 ${
          checked ? "bg-teal" : "bg-line"
        }`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`} />
      </button>
    </label>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, description, children,
}: { icon: typeof Settings; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3 p-5 border-b border-border bg-slate-50/60/20">
        <div className="rounded-lg bg-teal/10 p-2 shrink-0">
          <Icon className="h-4 w-4 text-teal" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-slate mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-5 divide-y divide-border ">{children}</div>
    </div>
  );
}

export default function AccommodationSettingsPage() {
  const [settings, setSettings] = useState<AccomSettings>(DEFAULT);
  const [schoolPolicy, setSchoolPolicy] = useState<SchoolPolicy>({ boardingType: "", genderPolicy: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/accommodation/settings").then((r) => r.ok ? r.json() : null),
      fetch("/api/school/settings").then((r) => r.ok ? r.json() : null),
    ]).then(([accom, school]) => {
      if (accom) setSettings({ ...DEFAULT, ...accom });
      if (school) setSchoolPolicy({ boardingType: school.boardingType ?? "", genderPolicy: school.genderPolicy ?? "" });
    }).finally(() => setLoading(false));
  }, []);

  const patch = (p: Partial<AccomSettings>) => setSettings((s) => ({ ...s, ...p }));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/accommodation/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // boardingType and schoolGenderPolicy are owned by /api/school/settings —
          // pass through the current values so the API constraint is satisfied.
          boardingType:            schoolPolicy.boardingType || "DAY_AND_BOARDING",
          schoolGenderPolicy:      schoolPolicy.genderPolicy || "MIXED",
          enableDormCaptains:      settings.enableDormCaptains,
          enableTransfers:         settings.enableTransfers,
          defaultAllocationPolicy: settings.defaultAllocationPolicy,
          occupancyWarningPct:     settings.occupancyWarningPct,
          bedTrackingEnabled:      settings.bedTrackingEnabled,
          analyticsEnabled:        settings.analyticsEnabled,
          notifyOnAllocation:      settings.notifyOnAllocation,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
      setSettings({ ...DEFAULT, ...json });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="space-y-4 mt-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-line/40/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Accommodation Settings"
        description="Module-wide preferences for boarding management. Individual dorm configurations are set on each dormitory."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {saved && <div className="mb-4"><SuccessBanner message="Settings saved successfully." onDismiss={() => setSaved(false)} /></div>}

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">

        {/* Boarding type — read-only, configured in School Settings */}
        <SectionCard icon={BedDouble} title="School Boarding Configuration"
          description="These values are set in School Configuration and apply system-wide.">
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate mb-1">Boarding type</p>
                <p className="text-sm font-semibold text-foreground">
                  {BOARDING_LABEL[schoolPolicy.boardingType] ?? schoolPolicy.boardingType ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate mb-1">Gender admission policy</p>
                <p className="text-sm font-semibold text-foreground">
                  {GENDER_POLICY_LABEL[schoolPolicy.genderPolicy] ?? schoolPolicy.genderPolicy ?? "—"}
                </p>
              </div>
            </div>
            <Link href="/principal/settings?tab=school"
              className="inline-flex items-center gap-1.5 text-xs text-teal hover:underline font-medium">
              <ExternalLink className="h-3 w-3" />
              Change in School Configuration → Admission Policy
            </Link>
          </div>
        </SectionCard>

        {/* Allocation */}
        <SectionCard icon={Users} title="Allocation Behaviour"
          description="Default policies applied when new dormitories are registered or students are allocated.">
          <div className="py-4">
            <FormField label="Default allocation policy for new dormitories"
              helper="Each dorm can override this. Use Restricted to enforce form-based separation by default.">
              <select className={inputClass} value={settings.defaultAllocationPolicy}
                onChange={(e) => patch({ defaultAllocationPolicy: e.target.value })}>
                <option value="MIXED_FORMS">Mixed Forms — any form may share a dorm</option>
                <option value="RESTRICTED_BY_FORM">Restricted by Form — only selected forms per dorm</option>
              </select>
            </FormField>
          </div>
          <ToggleRow
            label="Enable dorm captains"
            description="Allow a student to be assigned as the dorm captain of each dormitory."
            checked={settings.enableDormCaptains}
            onChange={(v) => patch({ enableDormCaptains: v })}
          />
          <ToggleRow
            label="Enable transfers"
            description="Allow students to be transferred between dormitories without being fully deallocated first."
            checked={settings.enableTransfers}
            onChange={(v) => patch({ enableTransfers: v })}
          />
        </SectionCard>

        {/* Occupancy */}
        <SectionCard icon={ShieldCheck} title="Occupancy & Capacity"
          description="Controls capacity tracking, warnings, and bed-level management.">
          <div className="py-4">
            <FormField label="Occupancy warning threshold (%)"
              helper="A dorm card turns amber and shows a warning when occupancy reaches or exceeds this percentage.">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={50} max={100} step={5}
                  value={settings.occupancyWarningPct}
                  onChange={(e) => patch({ occupancyWarningPct: parseInt(e.target.value) })}
                  className="flex-1 accent-teal"
                />
                <span className="text-sm font-semibold text-foreground tabular-nums w-10 text-right">
                  {settings.occupancyWarningPct}%
                </span>
              </div>
            </FormField>
          </div>
          <ToggleRow
            label="Enable bed-level tracking"
            description="Track individual beds and sleeping positions (Upper/Lower/Custom). When off, allocation is dorm-level only."
            checked={settings.bedTrackingEnabled}
            onChange={(v) => patch({ bedTrackingEnabled: v })}
          />
        </SectionCard>

        {/* Analytics & notifications */}
        <SectionCard icon={BarChart3} title="Analytics & Notifications"
          description="Dashboard widgets and automated notifications.">
          <ToggleRow
            label="Show analytics on dashboard"
            description="Display occupancy trends and boarding population charts on the accommodation overview."
            checked={settings.analyticsEnabled}
            onChange={(v) => patch({ analyticsEnabled: v })}
          />
          <ToggleRow
            label="Notify on allocation / transfer"
            description="Send a notification to the boarding master when a student is allocated or transferred to their dorm."
            checked={settings.notifyOnAllocation}
            onChange={(v) => patch({ notifyOnAllocation: v })}
          />
        </SectionCard>

        {/* Note */}
        <div className="rounded-lg border border-border bg-background p-4 flex items-start gap-3">
          <ArrowRight className="h-4 w-4 text-slate mt-0.5 shrink-0" />
          <p className="text-xs text-slate leading-relaxed">
            Dorm-specific settings (structure, bed types, cubicle layouts, per-dorm allocation policies) are
            configured individually on each dormitory&rsquo;s registration page — not here.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          {settings.updatedAt && (
            <p className="text-xs text-slate">
              Last saved {new Date(settings.updatedAt).toLocaleDateString()}
            </p>
          )}
          <div className="ml-auto flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-success font-medium">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            <button type="submit" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
