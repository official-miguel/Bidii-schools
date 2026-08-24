"use client";

import { useEffect, useState, FormEvent, useRef, useCallback } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, labelClass, secondaryButtonClass, royalButtonClass,
} from "@/components/ui";
import { SkeletonBar } from "@/components/ui/ProgressivePage";
import {
  CheckCircle2, AlertCircle, Zap, Calendar, MessageSquare,
  Mail, Key, Trash2, RefreshCw, BookOpen, BarChart3, Sparkles,
  Plug, ChevronRight, BedDouble, Users, ShieldCheck, ArrowRight,
  School,
} from "lucide-react";
import SomaAIConfigPanel from "@/components/SomaAIConfigPanel";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Provider = "GEMINI" | "GOOGLE_CALENDAR" | "SMS" | "WHATSAPP" | "EMAIL";

type IntegrationStatus = {
  provider: Provider;
  configured: boolean;
  keyPreview: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

type SectionId = "integrations" | "ranking" | "library" | "ai" | "dormitory" | "school";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar nav definition
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "school",       label: "School Configuration", sublabel: "Logo, motto, gender & boarding", Icon: School    },
  { id: "integrations", label: "API Integrations",      sublabel: "Connect external services",       Icon: Plug      },
  { id: "ranking",      label: "Ranking",               sublabel: "Teacher performance weights",     Icon: BarChart3 },
  { id: "library",      label: "Library",               sublabel: "Borrowing rules & fines",         Icon: BookOpen  },
  { id: "dormitory",    label: "Dormitory",             sublabel: "Boarding & allocation config",    Icon: BedDouble },
  { id: "ai",           label: "AI Configuration",      sublabel: "Soma AI & Gemini",                Icon: Sparkles  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Provider metadata
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_INFO: Record<Provider, {
  label: string; description: string; keyLabel: string;
  placeholder: string; testable?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  GEMINI: {
    label: "Google Gemini",
    description: "Powers the AI Timetable Generator, AI TOD Scheduler, and School Intelligence.",
    keyLabel: "API key", placeholder: "AIza...", testable: true,
    Icon: Zap,
  },
  GOOGLE_CALENDAR: {
    label: "Google Calendar",
    description: "Syncs the school calendar with Google Calendar for staff.",
    keyLabel: "API key", placeholder: "AIza...",
    Icon: Calendar,
  },
  SMS: {
    label: "SMS Provider",
    description: "Sends bulk SMS from the Communication Centre to parents and staff.",
    keyLabel: "API key / Auth token", placeholder: "",
    Icon: MessageSquare,
  },
  WHATSAPP: {
    label: "WhatsApp",
    description: "Sends WhatsApp messages to parents with a WhatsApp number on file.",
    keyLabel: "API key / Access token", placeholder: "",
    Icon: MessageSquare,
  },
  EMAIL: {
    label: "Email (SMTP)",
    description: "Sends email notifications from the Communication Centre.",
    keyLabel: "SMTP password / API key", placeholder: "",
    Icon: Mail,
  },
};

const PROVIDER_ORDER: Provider[] = ["GEMINI", "GOOGLE_CALENDAR", "SMS", "WHATSAPP", "EMAIL"];

// ─────────────────────────────────────────────────────────────────────────────
// RankingConfigForm  (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

interface RankingConfigData {
  improvementWeight: number;
  completionWeight: number;
  absoluteWeight: number;
  updatedAt: string | null;
}

function RankingConfigForm() {
  const [config, setConfig]         = useState<RankingConfigData | null>(null);

  const [rankDraft, setRankDraft, clearRankDraft] = useFormDraft("bidii_draft_settings_ranking", {
    improvement: "0.40",
    completion:  "0.30",
    absolute:    "0.30",
  });

  const [improvement, setImprovement] = useState(rankDraft.improvement);
  const [completion,  setCompletion]  = useState(rankDraft.completion);
  const [absolute,    setAbsolute]    = useState(rankDraft.absolute);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  // Track whether the user has made edits — if not, let the API response win
  const [dirty, setDirty]     = useState(false);

  useEffect(() => {
    fetch("/api/settings/ranking-config")
      .then((r) => r.json())
      .then((d: RankingConfigData) => {
        setConfig(d);
        // Only overwrite local state with server values if the user hasn't edited
        if (!dirty) {
          setImprovement(d.improvementWeight.toFixed(2));
          setCompletion(d.completionWeight.toFixed(2));
          setAbsolute(d.absoluteWeight.toFixed(2));
        }
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load ranking configuration."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    if (!dirty) return;
    setRankDraft({ improvement, completion, absolute });
  }, [improvement, completion, absolute, dirty, setRankDraft]);

  function markDirty<T>(setter: (v: T) => void): (v: T) => void {
    return (v: T) => { setDirty(true); setter(v); };
  }

  const sum = parseFloat(improvement || "0") + parseFloat(completion || "0") + parseFloat(absolute || "0");
  const sumValid = Math.abs(sum - 1.0) <= 0.001;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);
    const res = await fetch("/api/settings/ranking-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        improvementWeight: parseFloat(improvement),
        completionWeight:  parseFloat(completion),
        absoluteWeight:    parseFloat(absolute),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    setSavedAt(data.updatedAt); setConfig(data); setSaved(true);
    clearRankDraft(); setDirty(false);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!config && !error) return (
    <div className="space-y-3">
      <SkeletonBar height="1rem" width="70%" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" />
      </div>
      <SkeletonBar height="2.25rem" width="8rem" />
    </div>
  );

  const fields = [
    { label: "Improvement weight", key: "improvement", value: improvement, set: markDirty(setImprovement),
      hint: "Weight for score improvement over previous period." },
    { label: "Completion weight",  key: "completion",  value: completion,  set: markDirty(setCompletion),
      hint: "Weight for marks-entry completion rate." },
    { label: "Absolute weight",    key: "absolute",    value: absolute,    set: markDirty(setAbsolute),
      hint: "Weight for absolute class mean points." },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-xl">
      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="Weights saved successfully." />}
      <div className="rounded-xl bg-paper border border-line px-4 py-3 text-sm text-slate leading-relaxed dark:bg-dark-surface dark:border-dark-border">
        These three weights must sum to <strong className="text-ink dark:text-dark-text">1.0</strong>.
        They determine how the composite teacher ranking score is calculated each term.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {fields.map(({ label, key, value, set, hint }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input type="number" step="0.01" min="0" max="1"
              value={value} onChange={(e) => set(e.target.value)} className={inputClass} />
            <p className="text-xs text-slate mt-1.5 leading-relaxed dark:text-dark-muted">{hint}</p>
          </div>
        ))}
      </div>
      <div className={`inline-flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2 ${
        sumValid
          ? "bg-success-bg text-success border border-success/20"
          : "bg-danger-bg text-danger border border-danger/20"
      }`}>
        {sumValid
          ? <CheckCircle2 className="h-4 w-4 shrink-0" />
          : <AlertCircle  className="h-4 w-4 shrink-0" />}
        Sum: {sum.toFixed(3)}{sumValid ? " — valid" : " — must equal 1.000"}
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving || !sumValid} className={royalButtonClass}>
          {saving ? "Saving…" : "Save weights"}
        </button>
        {savedAt && <span className="text-xs text-slate dark:text-dark-muted">Last saved: {new Date(savedAt).toLocaleString()}</span>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LibrarySettingsForm  (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

interface LibrarySettingsData {
  maxBooksPerStudent:   number;
  maxBorrowDays:        number;
  finePerDay:           number;
  maxRenewals:          number;
  eligibleFromForm:     number | null;
  cardValidityDays:     number | null;
  overdueAlertDays:     number;
  updatedAt:            string | null;
}

function LibrarySettingsForm() {
  const [data,          setData]          = useState<LibrarySettingsData | null>(null);

  const [libDraft, setLibDraft, clearLibDraft] = useFormDraft("bidii_draft_settings_library", {
    maxBooks:        "3",
    maxDays:         "14",
    finePerDay:      "5.00",
    maxRenewals:     "1",
    eligibleFromForm: "",
    cardValidityDays: "",
    overdueAlertDays: "7",
  });

  const [maxBooks,      setMaxBooks]      = useState(libDraft.maxBooks);
  const [maxDays,       setMaxDays]       = useState(libDraft.maxDays);
  const [finePerDay,    setFinePerDay]    = useState(libDraft.finePerDay);
  const [maxRenewals,   setMaxRenewals]   = useState(libDraft.maxRenewals);
  const [eligibleFromForm, setEligibleFromForm] = useState(libDraft.eligibleFromForm);
  const [cardValidityDays, setCardValidityDays] = useState(libDraft.cardValidityDays);
  const [overdueAlertDays, setOverdueAlertDays] = useState(libDraft.overdueAlertDays);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  useEffect(() => {
    fetch("/api/library/settings")
      .then(r => r.json())
      .then((d: LibrarySettingsData) => {
        setData(d);
        if (!dirty) {
          setMaxBooks(String(d.maxBooksPerStudent));
          setMaxDays(String(d.maxBorrowDays));
          setFinePerDay(d.finePerDay.toFixed(2));
          setMaxRenewals(String(d.maxRenewals ?? 1));
          setEligibleFromForm(d.eligibleFromForm ? String(d.eligibleFromForm) : "");
          setCardValidityDays(d.cardValidityDays ? String(d.cardValidityDays) : "");
          setOverdueAlertDays(String(d.overdueAlertDays ?? 7));
        }
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load library settings."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    if (!dirty) return;
    setLibDraft({ maxBooks, maxDays, finePerDay, maxRenewals, eligibleFromForm, cardValidityDays, overdueAlertDays });
  }, [maxBooks, maxDays, finePerDay, maxRenewals, eligibleFromForm, cardValidityDays, overdueAlertDays, dirty, setLibDraft]);

  function md<T>(setter: (v: T) => void) { return (v: T) => { setDirty(true); setter(v); }; }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);
    const res = await fetch("/api/library/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxBooksPerStudent:   parseInt(maxBooks),
        maxBorrowDays:        parseInt(maxDays),
        finePerDay:           parseFloat(finePerDay),
        maxRenewals:          parseInt(maxRenewals),
        eligibleFromForm:     eligibleFromForm ? parseInt(eligibleFromForm) : null,
        cardValidityDays:     cardValidityDays ? parseInt(cardValidityDays) : null,
        overdueAlertDays:     parseInt(overdueAlertDays),
      }),
    });
    const d = await res.json(); setSaving(false);
    if (!res.ok) { setError(d.error ?? "Failed to save."); return; }
    setSavedAt(d.updatedAt); setData(d); setSaved(true);
    clearLibDraft(); setDirty(false);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!data && !error) return (
    <div className="space-y-3">
      <SkeletonBar height="1rem" width="80%" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" /><SkeletonBar height="3.5rem" />
      </div>
      <SkeletonBar height="2.25rem" width="8rem" />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-2xl">
      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="Library settings saved." />}

      {/* Borrowing rules */}
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-1">Borrowing Rules</h3>
        <p className="text-xs text-slate dark:text-dark-muted mb-4">Controls how many books students can borrow, how long, and what fines accrue.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Max books / student", value: maxBooks,   set: md(setMaxBooks),   min: "1",  max: "20",  hint: "Books at once" },
            { label: "Max borrow days",     value: maxDays,    set: md(setMaxDays),    min: "1",  max: "365", hint: "Before overdue" },
            { label: "Fine / day (KES)",    value: finePerDay, set: md(setFinePerDay), min: "0",  step: "0.50", hint: "Daily penalty" },
            { label: "Max renewals",        value: maxRenewals,set: md(setMaxRenewals),min: "0",  max: "10",  hint: "Per borrow" },
          ].map(({ label, hint, value, set, ...rest }) => (
            <div key={label}>
              <label className={labelClass}>{label}</label>
              <input type="number" value={value} onChange={e => set(e.target.value)} className={inputClass} {...rest} />
              <p className="text-xs text-slate dark:text-dark-muted mt-1">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Eligibility & card expiry */}
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-1">Eligibility & Card Expiry</h3>
        <p className="text-xs text-slate dark:text-dark-muted mb-4">Control which students are eligible for a library card and whether cards expire.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Eligible from form</label>
            <input type="number" min="1" max="8" className={inputClass} value={eligibleFromForm}
              onChange={e => md(setEligibleFromForm)(e.target.value)} placeholder="All forms (blank)" />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Leave blank to include all forms.</p>
          </div>
          <div>
            <label className={labelClass}>Card validity (days)</label>
            <input type="number" min="1" max="3650" className={inputClass} value={cardValidityDays}
              onChange={e => md(setCardValidityDays)(e.target.value)} placeholder="No expiry (blank)" />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Leave blank for no expiry.</p>
          </div>
          <div>
            <label className={labelClass}>Overdue alert (days)</label>
            <input type="number" min="1" max="365" className={inputClass} value={overdueAlertDays}
              onChange={e => md(setOverdueAlertDays)(e.target.value)} />
            <p className="text-xs text-slate dark:text-dark-muted mt-1">Flag books overdue by this many days.</p>
          </div>
        </div>
      </div>

      {/* Identification method is now auto-detected per device — no setting needed */}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving} className={royalButtonClass}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {savedAt && <span className="text-xs text-slate dark:text-dark-muted">Last saved: {new Date(savedAt).toLocaleString()}</span>}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IntegrationsPanel  (unchanged logic, extracted for clarity)
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationsPanel() {
  const [statuses,   setStatuses]   = useState<IntegrationStatus[] | null>(null);
  const [editing,    setEditing]    = useState<Provider | null>(null);
  const [intError,   setIntError]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [testResult, setTestResult] = useState<{ provider: Provider; ok: boolean; message: string } | null>(null);
  const [testing,    setTesting]    = useState<Provider | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/integrations");
    setStatuses(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function statusFor(p: Provider) { return statuses?.find((s) => s.provider === p) ?? null; }

  async function handleSaveKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setIntError(null); setSaving(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/settings/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: editing, apiKey: form.get("apiKey") }),
    });
    const data = await res.json(); setSaving(false);
    if (!res.ok) { setIntError(data.error || "Couldn't save this key."); return; }
    setStatuses(data); setEditing(null);
  }

  async function handleRemove(provider: Provider) {
    if (!confirm(`Remove the saved ${PROVIDER_INFO[provider].label} key? Features using it will stop working.`)) return;
    const res = await fetch(`/api/settings/integrations/${provider}`, { method: "DELETE" });
    if (res.ok) setStatuses(await res.json());
  }

  async function handleTest(provider: Provider) {
    setTesting(provider); setTestResult(null);
    const res = await fetch("/api/settings/integrations/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json(); setTesting(null);
    setTestResult({ provider, ok: !!data.ok,
      message: data.ok ? "Key works — connected successfully." : data.error || "Couldn't verify this key." });
  }

  return (
    <>
      <div className="space-y-3 max-w-3xl">
        {PROVIDER_ORDER.map((provider) => {
          const info   = PROVIDER_INFO[provider];
          const status = statusFor(provider);
          const { Icon } = info;
          return (
            <div key={provider}
              className="rounded-xl bg-white border border-line shadow-sm p-4 sm:p-5
                         hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border">
              {/* Top row: icon + info */}
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-lg shrink-0 ${
                  status?.configured ? "bg-teal-50 text-teal dark:bg-teal/10" : "bg-paper text-slate dark:bg-dark-bg dark:text-dark-muted"
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink dark:text-dark-text">{info.label}</p>
                    {status?.configured ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
                                       bg-success-bg text-success border border-success/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Configured · ···{status.keyPreview}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-line text-slate border border-line
                                       dark:bg-dark-border dark:text-dark-muted dark:border-dark-border">
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate dark:text-dark-muted mt-1 leading-relaxed">{info.description}</p>
                  {testResult?.provider === provider && (
                    <div className={`mt-2 flex items-center gap-1.5 text-sm ${testResult.ok ? "text-success" : "text-danger"}`}>
                      {testResult.ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        : <AlertCircle  className="h-3.5 w-3.5 shrink-0" />}
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>
              {/* Action buttons — full-width row on mobile, inline on sm+ */}
              <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-0 sm:justify-end">
                {info.testable && status?.configured && (
                  <button className={secondaryButtonClass} disabled={testing === provider} onClick={() => handleTest(provider)}>
                    {testing === provider
                      ? <><RefreshCw className="h-4 w-4 animate-spin" />Testing…</>
                      : <><RefreshCw className="h-4 w-4" />Test</>}
                  </button>
                )}
                <button className={royalButtonClass} onClick={() => setEditing(provider)}>
                  <Key className="h-4 w-4" />
                  {status?.configured ? "Update key" : "Add key"}
                </button>
                {status?.configured && (
                  <button
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-line
                               text-slate hover:text-danger hover:bg-danger-bg/30 hover:border-danger/20
                               transition-all dark:border-dark-border dark:text-dark-muted"
                    onClick={() => handleRemove(provider)}
                    aria-label={`Remove ${info.label} key`}
                    title="Remove key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* API key modal */}
      {editing && (
        <Modal
          title={`${statusFor(editing)?.configured ? "Update" : "Add"} ${PROVIDER_INFO[editing].label} key`}
          description="This key is stored encrypted. Only the last 4 characters will be shown after saving."
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleSaveKey} className="space-y-4">
            {intError && <ErrorBanner message={intError} />}
            <div className="form-section">
              <div className="form-section-title">API Credentials</div>
              <div>
                <label className={labelClass}>
                  {PROVIDER_INFO[editing].keyLabel} <span className="text-danger">*</span>
                </label>
                <input name="apiKey" required autoComplete="off" type="password"
                  placeholder={PROVIDER_INFO[editing].placeholder || "Paste your key here"}
                  className={inputClass} autoFocus />
                <p className="text-xs text-slate dark:text-dark-muted mt-1.5 leading-relaxed">
                  Stored encrypted on the server. You won&apos;t be able to view it again after
                  saving — only the last 4 characters, to confirm which key is active.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className={royalButtonClass} disabled={saving}>
                <Key className="h-4 w-4" />{saving ? "Saving…" : "Save key"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DormitorySettingsForm
// ─────────────────────────────────────────────────────────────────────────────

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

// boardingType and genderPolicy live on the School model — read here, never edited here.
interface DormSchoolPolicy {
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

const ACCOM_DEFAULT: AccomSettings = {
  enableDormCaptains: true, enableTransfers: true,
  defaultAllocationPolicy: "MIXED_FORMS", occupancyWarningPct: 90,
  bedTrackingEnabled: true, analyticsEnabled: true, notifyOnAllocation: false,
  updatedAt: null,
};

function DormToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink dark:text-dark-text">{label}</p>
        <p className="text-xs text-slate mt-0.5 leading-relaxed dark:text-dark-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 ${
          checked ? "bg-teal" : "bg-line dark:bg-dark-border"
        }`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`} />
      </button>
    </label>
  );
}

function DormSectionCard({
  icon: Icon, title, description, children,
}: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border overflow-hidden">
      <div className="flex items-start gap-3 p-5 border-b border-line dark:border-dark-border bg-slate-50/60 dark:bg-dark-border/20">
        <div className="rounded-lg bg-teal/10 p-2 shrink-0">
          <Icon className="h-4 w-4 text-teal" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">{title}</p>
          <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">{description}</p>
        </div>
      </div>
      <div className="px-5 divide-y divide-line dark:divide-dark-border">{children}</div>
    </div>
  );
}

function DormitorySettingsForm() {
  const [dormDraft, setDormDraft, clearDormDraft] = useFormDraft("bidii_draft_settings_dorm", ACCOM_DEFAULT as AccomSettings & Record<string, unknown>);

  const [settings,     setSettings]     = useState<AccomSettings>(dormDraft as AccomSettings);
  const [schoolPolicy, setSchoolPolicy] = useState<DormSchoolPolicy>({ boardingType: "", genderPolicy: "" });
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [saved,        setSaved]        = useState(false);
  const [dirty,        setDirty]        = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/accommodation/settings").then((r) => r.ok ? r.json() : null),
      fetch("/api/school/settings").then((r) => r.ok ? r.json() : null),
    ]).then(([accom, school]) => {
      if (accom && !dirty) setSettings({ ...ACCOM_DEFAULT, ...accom });
      if (school) setSchoolPolicy({ boardingType: school.boardingType ?? "", genderPolicy: school.genderPolicy ?? "" });
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist when user edits
  useEffect(() => {
    if (!dirty) return;
    setDormDraft(settings as unknown as Record<string, unknown>);
  }, [settings, dirty, setDormDraft]);

  const patch = (p: Partial<AccomSettings>) => {
    setDirty(true);
    setSettings((s) => ({ ...s, ...p }));
  };

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/accommodation/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // boardingType and schoolGenderPolicy are owned by /api/school/settings —
          // pass through the current school values so the API schema is satisfied.
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
      setSettings({ ...ACCOM_DEFAULT, ...json });
      clearDormDraft(); setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-40 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
      ))}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {saved && <SuccessBanner message="Dormitory settings saved successfully." />}

      {/* Boarding type — read-only, owned by School Configuration */}
      <DormSectionCard icon={BedDouble} title="School Boarding Configuration"
        description="These values are configured in School Configuration and apply system-wide.">
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate dark:text-dark-muted mb-1">Boarding type</p>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">
                {BOARDING_LABEL[schoolPolicy.boardingType] ?? schoolPolicy.boardingType ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate dark:text-dark-muted mb-1">Gender admission policy</p>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">
                {GENDER_POLICY_LABEL[schoolPolicy.genderPolicy] ?? schoolPolicy.genderPolicy ?? "—"}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate dark:text-dark-muted">
            To change these, go to the{" "}
            <button type="button" className="text-teal hover:underline font-medium"
              onClick={() => {
                // Switch to the "school" tab within this same settings page
                window.dispatchEvent(new CustomEvent("bidii:settings:tab", { detail: "school" }));
              }}>
              School Configuration
            </button>{" "}
            section above.
          </p>
        </div>
      </DormSectionCard>

      {/* Allocation */}
      <DormSectionCard icon={Users} title="Allocation Behaviour"
        description="Default policies applied when new dormitories are registered or students are allocated.">
        <div className="py-4">
          <label className={labelClass}>Default allocation policy for new dormitories</label>
          <select className={inputClass} value={settings.defaultAllocationPolicy}
            onChange={(e) => patch({ defaultAllocationPolicy: e.target.value })}>
            <option value="MIXED_FORMS">Mixed Forms — any form may share a dorm</option>
            <option value="RESTRICTED_BY_FORM">Restricted by Form — only selected forms per dorm</option>
          </select>
          <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
            Each dorm can override this individually.
          </p>
        </div>
        <DormToggleRow
          label="Enable dorm captains"
          description="Allow a student to be assigned as the dorm captain of each dormitory."
          checked={settings.enableDormCaptains}
          onChange={(v) => patch({ enableDormCaptains: v })}
        />
        <DormToggleRow
          label="Enable transfers"
          description="Allow students to be transferred between dormitories without being fully deallocated first."
          checked={settings.enableTransfers}
          onChange={(v) => patch({ enableTransfers: v })}
        />
      </DormSectionCard>

      {/* Occupancy */}
      <DormSectionCard icon={ShieldCheck} title="Occupancy & Capacity"
        description="Controls capacity tracking, warnings, and bed-level management.">
        <div className="py-4">
          <label className={labelClass}>Occupancy warning threshold (%)</label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="range" min={50} max={100} step={5}
              value={settings.occupancyWarningPct}
              onChange={(e) => patch({ occupancyWarningPct: parseInt(e.target.value) })}
              className="flex-1 accent-teal"
            />
            <span className="text-sm font-semibold text-ink tabular-nums w-10 text-right dark:text-dark-text">
              {settings.occupancyWarningPct}%
            </span>
          </div>
          <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
            A dorm card turns amber when occupancy reaches or exceeds this percentage.
          </p>
        </div>
        <DormToggleRow
          label="Enable bed-level tracking"
          description="Track individual beds and sleeping positions (Upper/Lower/Custom). When off, allocation is dorm-level only."
          checked={settings.bedTrackingEnabled}
          onChange={(v) => patch({ bedTrackingEnabled: v })}
        />
      </DormSectionCard>

      {/* Analytics & notifications */}
      <DormSectionCard icon={BarChart3} title="Analytics & Notifications"
        description="Dashboard widgets and automated notifications.">
        <DormToggleRow
          label="Show analytics on dashboard"
          description="Display occupancy trends and boarding population charts on the accommodation overview."
          checked={settings.analyticsEnabled}
          onChange={(v) => patch({ analyticsEnabled: v })}
        />
        <DormToggleRow
          label="Notify on allocation / transfer"
          description="Send a notification to the boarding master when a student is allocated or transferred to their dorm."
          checked={settings.notifyOnAllocation}
          onChange={(v) => patch({ notifyOnAllocation: v })}
        />
      </DormSectionCard>

      {/* Note */}
      <div className="rounded-lg border border-line bg-paper dark:bg-dark-surface dark:border-dark-border p-4 flex items-start gap-3">
        <ArrowRight className="h-4 w-4 text-slate mt-0.5 shrink-0" />
        <p className="text-xs text-slate leading-relaxed dark:text-dark-muted">
          Dorm-specific settings (structure, bed types, cubicle layouts, per-dorm allocation policies) are
          configured individually on each dormitory&rsquo;s registration page under Student Life → Accommodation.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        {settings.updatedAt && (
          <p className="text-xs text-slate dark:text-dark-muted">
            Last saved {new Date(settings.updatedAt).toLocaleDateString()}
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-success font-medium">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          <button type="submit" disabled={saving} className={`${royalButtonClass} disabled:opacity-40`}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageUploadField — reusable file-picker with preview + remove
// ─────────────────────────────────────────────────────────────────────────────

function ImageUploadField({
  label,
  hint,
  field,
  currentUrl,
  onUploaded,
  onRemove,
}: {
  label: string;
  hint: string;
  field: "logo" | "stamp";
  currentUrl: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Local object URL for instant preview before the upload response comes back
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    // Show instant local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field", field);
      const res = await fetch("/api/school/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error ?? "Upload failed."); setPreview(null); return; }
      onUploaded(json.url);
    } catch { setUploadError("Network error — please try again."); setPreview(null); }
    finally { setUploading(false); }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected after a remove
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const displayUrl = preview ?? currentUrl;

  return (
    <div>
      <label className={labelClass}>{label}</label>

      {displayUrl ? (
        /* ── Preview state ── */
        <div className="mt-1 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={`${label} preview`}
            className="h-20 w-20 object-contain rounded-xl border border-line bg-white p-1.5 dark:bg-dark-surface dark:border-dark-border"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={`${secondaryButtonClass} !text-xs !py-1.5`}
            >
              {uploading ? "Uploading…" : "Replace image"}
            </button>
            <button
              type="button"
              onClick={() => { setPreview(null); onRemove(); }}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:underline disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      ) : (
        /* ── Drop-zone / empty state ── */
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
            cursor-pointer transition-colors px-4 py-7
            ${uploading
              ? "border-teal/40 bg-teal/5 dark:bg-teal/10"
              : "border-line hover:border-teal/50 hover:bg-teal/3 dark:border-dark-border dark:hover:border-teal/40"
            }`}
        >
          {uploading ? (
            <span className="inline-block h-5 w-5 rounded-full border-2 border-teal border-t-transparent animate-spin" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-center pointer-events-none">
              <div className="rounded-lg bg-teal/10 p-2.5 mb-1">
                <School className="h-5 w-5 text-teal" />
              </div>
              <p className="text-sm font-medium text-ink dark:text-dark-text">
                Click to upload or drag &amp; drop
              </p>
              <p className="text-xs text-slate dark:text-dark-muted">PNG, JPG, WebP or SVG · max 2 MB</p>
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <p className="mt-1.5 text-xs text-danger">{uploadError}</p>
      )}
      {!displayUrl && !uploadError && (
        <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">{hint}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={handleInputChange}
        aria-label={`Upload ${label}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SchoolConfigForm
// ─────────────────────────────────────────────────────────────────────────────

interface SchoolConfig {
  name: string;
  logoUrl: string | null;
  stampUrl: string | null;
  motto: string | null;
  boardingType: string;
  genderPolicy: string;
  autoAllocateDorms: boolean;
  updatedAt?: string | null;
}

function SchoolConfigForm() {
  const [config,  setConfig]  = useState<SchoolConfig | null>(null);

  const [schoolCfgDraft, setSchoolCfgDraft, clearSchoolCfgDraft] = useFormDraft("bidii_draft_settings_school", {
    motto:        "",
    boardingType: "DAY_AND_BOARDING",
    genderPolicy: "MIXED",
    autoAlloc:    false,
    // logoUrl and stampUrl are managed by ImageUploadField which posts immediately,
    // so we don't need to draft them — they're always server-persisted on upload.
  });

  const [logoUrl,  setLogoUrl]  = useState("");
  const [stampUrl, setStampUrl] = useState("");
  const [motto,    setMotto]    = useState(schoolCfgDraft.motto);
  const [boardingType, setBoardingType] = useState(schoolCfgDraft.boardingType);
  const [genderPolicy, setGenderPolicy] = useState(schoolCfgDraft.genderPolicy);
  const [autoAlloc,    setAutoAlloc]    = useState(schoolCfgDraft.autoAlloc);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  useEffect(() => {
    fetch("/api/school/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d: SchoolConfig | null) => {
        if (!d) return;
        setConfig(d);
        setLogoUrl(d.logoUrl ?? "");
        setStampUrl(d.stampUrl ?? "");
        if (!dirty) {
          setMotto(d.motto ?? "");
          setBoardingType(d.boardingType ?? "DAY_AND_BOARDING");
          setGenderPolicy(d.genderPolicy ?? "MIXED");
          setAutoAlloc(d.autoAllocateDorms ?? false);
        }
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load school configuration."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist user-edited fields on change
  useEffect(() => {
    if (!dirty) return;
    setSchoolCfgDraft({ motto, boardingType, genderPolicy, autoAlloc });
  }, [motto, boardingType, genderPolicy, autoAlloc, dirty, setSchoolCfgDraft]);

  function mds<T>(setter: (v: T) => void) { return (v: T) => { setDirty(true); setter(v); }; }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl:           logoUrl  || null,
          stampUrl:          stampUrl || null,
          motto:             motto.trim() || null,
          boardingType,
          genderPolicy,
          autoAllocateDorms: autoAlloc,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to save."); return; }
      setConfig(d);
      setSavedAt(d.updatedAt ?? null);
      clearSchoolCfgDraft(); setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Network error — please try again."); }
    finally { setSaving(false); }
  }

  if (!config && !error) return (
    <div className="space-y-4 max-w-2xl">
      {[...Array(4)].map((_, i) => <SkeletonBar key={i} height="3rem" />)}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-2xl">
      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="School configuration saved." />}

      {/* ── Identity & Branding ── */}
      <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border overflow-hidden">
        <div className="flex items-start gap-3 p-5 border-b border-line bg-slate-50/60 dark:bg-dark-border/20">
          <div className="rounded-lg bg-teal/10 p-2 shrink-0">
            <School className="h-4 w-4 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Identity &amp; Branding</p>
            <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">Logo, stamp, and school motto</p>
          </div>
        </div>
        <div className="px-5 py-5 space-y-6">
          {/* Motto */}
          <div>
            <label className={labelClass}>School motto</label>
            <input
              type="text"
              value={motto}
              onChange={(e) => mds(setMotto)(e.target.value)}
              placeholder="e.g. Excellence Through Hard Work"
              className={inputClass}
              maxLength={200}
            />
            <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
              Shown as a banner on every dashboard when users log in.
            </p>
          </div>

          {/* Logo upload */}
          <ImageUploadField
            label="School logo"
            hint="Used on report cards and the system profile."
            field="logo"
            currentUrl={logoUrl}
            onUploaded={(url) => setLogoUrl(url)}
            onRemove={() => setLogoUrl("")}
          />

          {/* Stamp upload */}
          <ImageUploadField
            label="School stamp"
            hint="Printed on official school documents and report cards."
            field="stamp"
            currentUrl={stampUrl}
            onUploaded={(url) => setStampUrl(url)}
            onRemove={() => setStampUrl("")}
          />
        </div>
      </div>

      {/* ── Admission Policy ── */}
      <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border overflow-hidden">
        <div className="flex items-start gap-3 p-5 border-b border-line bg-slate-50/60 dark:bg-dark-border/20">
          <div className="rounded-lg bg-teal/10 p-2 shrink-0">
            <Users className="h-4 w-4 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Admission Policy</p>
            <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">Gender policy and boarding type govern student registration defaults</p>
          </div>
        </div>
        <div className="px-5 py-5 space-y-4">
          {/* Gender policy */}
          <div>
            <label className={labelClass}>School gender policy</label>
            <select value={genderPolicy} onChange={(e) => mds(setGenderPolicy)(e.target.value)} className={inputClass}>
              <option value="MIXED">Mixed — both boys and girls</option>
              <option value="BOYS_ONLY">Boys only</option>
              <option value="GIRLS_ONLY">Girls only</option>
            </select>
            <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
              If Boys only or Girls only, the gender field in student registration will be auto-filled and locked.
              If Mixed, staff must choose per student.
            </p>
          </div>

          {/* Boarding type */}
          <div>
            <label className={labelClass}>Boarding type</label>
            <select value={boardingType} onChange={(e) => mds(setBoardingType)(e.target.value)} className={inputClass}>
              <option value="DAY_ONLY">Day school only — no boarding</option>
              <option value="DAY_AND_BOARDING">Day &amp; Boarding — students can be either</option>
              <option value="BOARDING_ONLY">Boarding only — all students board</option>
            </select>
            <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
              If Day &amp; Boarding, the registration form will have a Day / Boarding dropdown.
              If Boarding only, all students are automatically set as boarders.
            </p>
          </div>
        </div>
      </div>

      {/* ── Auto-allocation ── */}
      {boardingType !== "DAY_ONLY" && (
        <div className="rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border overflow-hidden">
          <div className="flex items-start gap-3 p-5 border-b border-line bg-slate-50/60 dark:bg-dark-border/20">
            <div className="rounded-lg bg-teal/10 p-2 shrink-0">
              <BedDouble className="h-4 w-4 text-teal" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">Dormitory Auto-Allocation</p>
              <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">Automatically assign dorms on student registration</p>
            </div>
          </div>
          <div className="px-5 py-5">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink dark:text-dark-text">Enable auto-allocation</p>
                <p className="text-xs text-slate mt-0.5 leading-relaxed dark:text-dark-muted">
                  When on, every new boarding student is automatically assigned to the next available dormitory
                  in round-robin order — one student per dorm, cycling through all active dorms in sequence,
                  respecting each dorm&apos;s gender policy, form restrictions, and capacity rules.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoAlloc}
                onClick={() => mds(setAutoAlloc)(!autoAlloc)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 ${
                  autoAlloc ? "bg-teal" : "bg-line dark:bg-dark-border"
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoAlloc ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 pt-2">
        {savedAt && (
          <p className="text-xs text-slate dark:text-dark-muted">
            Last saved {new Date(savedAt).toLocaleString()}
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-success font-medium">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          <button type="submit" disabled={saving} className={`${royalButtonClass} disabled:opacity-40`}>
            {saving ? "Saving…" : "Save configuration"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section content map
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_CONTENT: Record<SectionId, { heading: string; description: string; Content: React.ComponentType }> = {
  school: {
    heading: "School Configuration",
    description: "School identity, branding, gender policy, boarding type, and dormitory auto-allocation settings.",
    Content: SchoolConfigForm,
  },
  integrations: {
    heading: "API Integrations",
    description: "Connect external services. Keys are stored encrypted and never exposed to the browser.",
    Content: IntegrationsPanel,
  },
  ranking: {
    heading: "Ranking Configuration",
    description: "Adjust how the composite teacher performance score is weighted. Changes apply to all future ranking calculations.",
    Content: RankingConfigForm,
  },
  library: {
    heading: "Library Settings",
    description: "Configure borrowing limits, due dates, and overdue fines for the school library.",
    Content: LibrarySettingsForm,
  },
  dormitory: {
    heading: "Dormitory Configuration",
    description: "Module-wide preferences for boarding management. Individual dormitory structures and bed layouts are configured per dorm under Student Life → Accommodation.",
    Content: DormitorySettingsForm,
  },
  ai: {
    heading: "AI Configuration",
    description: "Configure Soma AI — the intelligent assistant powered by Google Gemini. API keys are encrypted at rest and never exposed to the browser.",
    Content: SomaAIConfigPanel,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main SettingsPage — sidebar on desktop, tab strip on mobile
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>("integrations");
  const rankingRef = useRef<HTMLDivElement>(null);
  const mobileTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as SectionId | null;
    const target = t ?? (window.location.hash === "#ranking" ? "ranking" : null);
    if (target && SECTIONS.some((s) => s.id === target)) {
      setActive(target);
      if (target === "ranking")
        setTimeout(() => rankingRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }

    const handler = (e: Event) => {
      const tab = (e as CustomEvent<SectionId>).detail;
      if (SECTIONS.some((s) => s.id === tab)) setActive(tab);
    };
    window.addEventListener("bidii:settings:tab", handler);
    return () => window.removeEventListener("bidii:settings:tab", handler);
  }, []);

  // Scroll the active mobile tab button into view when active changes
  useEffect(() => {
    const container = mobileTabsRef.current;
    if (!container) return;
    const btn = container.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  const section = SECTION_CONTENT[active];
  const { Content } = section;

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Manage school configuration, API integrations, AI, teacher ranking weights, library rules, and dormitory settings."
      />

      {/* ── Mobile tab strip (hidden on md+) ─────────────────────────── */}
      <div
        ref={mobileTabsRef}
        className="flex md:hidden overflow-x-auto gap-1 pb-1 mb-3 mt-2 scrollbar-none"
        role="tablist"
        aria-label="Settings sections"
      >
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              data-tab={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap
                shrink-0 transition-colors border
                ${isActive
                  ? "bg-teal/10 text-teal border-teal/30"
                  : "bg-white text-slate border-line hover:bg-paper hover:text-ink dark:bg-dark-surface dark:text-dark-muted dark:border-dark-border dark:hover:text-dark-text"
                }
              `}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Two-column shell (md+) ───────────────────────────────────── */}
      <div className="flex gap-0 min-h-[600px] rounded-2xl border border-line overflow-hidden
                      dark:border-dark-border">

        {/* ── Left sidebar nav — desktop only ─────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className="hidden md:flex w-60 xl:w-64 shrink-0 bg-paper border-r border-line
                     dark:bg-dark-surface dark:border-dark-border
                     flex-col py-2"
        >
          {SECTIONS.map(({ id, label, sublabel, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                aria-current={isActive ? "page" : undefined}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                  ${isActive
                    ? "bg-teal/8 border-r-2 border-teal text-teal dark:bg-teal/10"
                    : "text-slate hover:bg-white hover:text-ink dark:text-dark-muted dark:hover:bg-dark-bg dark:hover:text-dark-text border-r-2 border-transparent"
                  }
                `}
              >
                <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                  isActive ? "bg-teal/10 text-teal" : "bg-line/60 text-slate dark:bg-dark-border dark:text-dark-muted"
                }`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium leading-tight truncate ${
                    isActive ? "text-teal" : "text-ink dark:text-dark-text"
                  }`}>{label}</p>
                  <p className="text-[11px] text-slate dark:text-dark-muted truncate leading-tight mt-0.5">
                    {sublabel}
                  </p>
                </div>
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 ml-auto transition-opacity ${
                  isActive ? "opacity-100 text-teal" : "opacity-0"
                }`} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        {/* ── Content panel ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white dark:bg-dark-bg px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 overflow-y-auto">
          <div ref={active === "ranking" ? rankingRef : undefined}>
            <div className="mb-5 md:mb-6">
              <h2 className="text-base font-semibold text-ink dark:text-dark-text">
                {section.heading}
              </h2>
              <p className="text-sm text-slate dark:text-dark-muted mt-1">
                {section.description}
              </p>
            </div>
            <Content />
          </div>
        </div>
      </div>
    </div>
  );
}
