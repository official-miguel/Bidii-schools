"use client";

/**
 * /super-admin/schools/[id] — School Detail page
 *
 * Tabbed view:
 *   Overview | Errors | Storage | Modules | Imports | Audit
 *
 * Actions: Suspend/Reactivate, Edit plan tier, Impersonate admin
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams }              from "next/navigation";
import Link                                  from "next/link";
import {
  ChevronLeft, Building2, Users, GraduationCap, HardDrive,
  AlertTriangle, Puzzle, Upload, PauseCircle,
  PlayCircle, ExternalLink, CheckCircle2, MessageSquare,
  Sparkles, Key, Trash2, RefreshCw, ShieldCheck, Eye, EyeOff,
} from "lucide-react";
import {
  Card, Badge, Spinner, ErrorBanner, ProgressBar,
  Toggle, primaryButtonClass, secondaryButtonClass, dangerButtonClass,
} from "@/components/ui";

// ── Shared badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:     "bg-success-bg text-success border-success/20",
    ONBOARDING: "bg-info-bg text-info border-info/20",
    SUSPENDED:  "bg-danger-bg text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${map[status] ?? "bg-slate-100 text-slate border-border"}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-danger-bg text-danger border-danger/20",
    HIGH:     "bg-orange-50 text-orange-600 border-orange-200",
    MEDIUM:   "bg-warn-bg text-warn border-warn/20",
    LOW:      "bg-slate-100 text-slate border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[severity] ?? "bg-slate-100 text-slate border-border"}`}>
      {severity}
    </span>
  );
}

/**
 * The three optional modules. Everything else is core: it ships with every
 * school and has no switch. Keys are the RBAC module ids the API accepts;
 * `systemModule` is how the toggle row is stored.
 */
const OPTIONAL_MODULES = [
  { id: "LIBRARY",       systemModule: "LIBRARY",        label: "Library",       description: "Catalogue, cards, borrowing, and fines" },
  { id: "FEES",          systemModule: "FEE_MANAGEMENT", label: "Finance",       description: "Fee structures, invoicing, and payments" },
  { id: "ACCOMMODATION", systemModule: "ACCOMMODATION",  label: "Accommodation", description: "Dormitories, beds, and boarding allocations" },
] as const;

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id:"overview",  label:"Overview",  Icon: Building2      },
  { id:"errors",    label:"Errors",    Icon: AlertTriangle  },
  { id:"storage",   label:"Storage",   Icon: HardDrive      },
  { id:"modules",   label:"Modules",   Icon: Puzzle         },
  { id:"imports",   label:"Imports",   Icon: Upload         },
  { id:"sms",       label:"SMS",        Icon: MessageSquare },
  { id:"somaai",    label:"Soma AI",   Icon: Sparkles       },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── Main page ─────────────────────────────────────────────────────────────────
interface SchoolMetaShape {
  slug?:          string | null;
  status:        string;
  storageQuotaGb: number;
  contactPerson?: string | null;
  contactEmail?:  string | null;
  contactPhone?:  string | null;
  studentCount?:  number;
  staffCount?:    number;
}

interface ModuleToggle   { module: string; enabled: boolean }
interface StorageUsage   { sizeBytes: string; type: string }
interface SchoolDetail {
  id:                   string;
  name:                 string;
  email?:               string | null;
  phone?:               string | null;
  address?:             string | null;
  createdAt:            string;
  schoolMeta?:          SchoolMetaShape | null;
  schoolModuleToggles?: ModuleToggle[];
  storageUsages?:       StorageUsage[];
  _count?:              { students?: number; teachers?: number; systemErrors?: number };
  systemErrors?:        { id: string; message: string; severity: string; status: string; module?: string | null; occurrences: number; createdAt: string }[];
  importJobs?:          { id: string; type: string; fileName: string; totalRows: number; succeeded: number; failed: number; status: string; createdAt: string }[];
}

export default function SchoolDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();

  const [data, setData]         = useState<SchoolDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [tab, setTab]           = useState<TabId>("overview");
  const [busy, setBusy]         = useState(false);
  const [modulesBusy, setModulesBusy] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── School SMS credentials state ──────────────────────────────────────────
  // Each school bills its own Mobivas account, so its API key lives here —
  // nothing to do with the platform OTP provider under Settings.
  interface SchoolSmsConfig {
    configured: boolean;
    keyPreview: string | null;
    isActive:   boolean;
    clientId:   string | null;
    senderId:   string | null;
    updatedAt:  string | null;
  }
  const [smsConfig,  setSmsConfig]  = useState<SchoolSmsConfig | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError,   setSmsError]   = useState<string | null>(null);
  const [smsSaving,  setSmsSaving]  = useState(false);
  const [smsRemoving, setSmsRemoving] = useState(false);
  const [smsKey,      setSmsKey]      = useState("");
  const [smsClientId, setSmsClientId] = useState("");
  const [smsSenderId, setSmsSenderId] = useState("");
  const [showSmsKey,  setShowSmsKey]  = useState(false);

  // ── Soma AI / Gemini key state ────────────────────────────────────────────
  interface GeminiKeyStatus {
    configured: boolean;
    keyPreview: string | null;
    isActive: boolean;
    config: { model: string; enabled: boolean; temperature: number; maxOutputTokens: number };
    usage: { totalRequests: number; lastUsedAt: string | null };
  }
  const [aiStatus,     setAiStatus]     = useState<GeminiKeyStatus | null>(null);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState<string | null>(null);
  const [aiSaving,     setAiSaving]     = useState(false);
  const [aiSaved,      setAiSaved]      = useState(false);
  const [aiDeleting,   setAiDeleting]   = useState(false);
  const [aiTesting,    setAiTesting]    = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean; model?: string; latencyMs?: number; error?: string;
  } | null>(null);
  const [aiKey,        setAiKey]        = useState("");
  const [showAiKey,    setShowAiKey]    = useState(false);

  const loadAiStatus = useCallback(async () => {
    setAiLoading(true); setAiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/gemini-key`);
      if (!res.ok) throw new Error("Failed to load Soma AI status");
      setAiStatus(await res.json());
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}`);
      if (!res.ok) throw new Error("Failed to load school");
      const j = await res.json();
      setData(j.school);
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadSmsConfig = useCallback(async () => {
    setSmsLoading(true); setSmsError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/sms-config`);
      if (!res.ok) throw new Error("Failed to load SMS settings");
      const j = await res.json() as { config: SchoolSmsConfig };
      setSmsConfig(j.config);
      // Pre-fill the non-secret fields so an edit doesn't have to retype them.
      setSmsClientId(j.config.clientId ?? "");
      setSmsSenderId(j.config.senderId ?? "");
    } catch (e: unknown) {
      setSmsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSmsLoading(false);
    }
  }, [id]);

  useEffect(() => { if (tab === "sms") loadSmsConfig(); }, [tab, loadSmsConfig]);
  useEffect(() => { if (tab === "somaai") loadAiStatus(); }, [tab, loadAiStatus]);

  async function handleAiKeySave(e: React.FormEvent) {
    e.preventDefault();
    if (!aiKey.trim()) return;
    setAiSaving(true); setAiError(null); setAiSaved(false); setAiTestResult(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/gemini-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: aiKey.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save key");
      setAiStatus(j);
      setAiKey("");
      setShowAiKey(false);
      setAiSaved(true);
      setSuccessMsg(`Gemini API key ${j.keyPreview ? "saved (···" + j.keyPreview + ")" : "saved"}`);
      setTimeout(() => { setAiSaved(false); setSuccessMsg(null); }, 4000);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiSaving(false);
    }
  }

  async function handleAiKeyDelete() {
    if (!confirm(`Remove the Gemini API key for "${data?.name}"?\n\nSoma AI will stop working for all users at this school.`)) return;
    setAiDeleting(true); setAiError(null); setAiTestResult(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/gemini-key`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to remove key");
      setAiStatus((prev) => prev
        ? { ...prev, configured: false, keyPreview: null, isActive: false }
        : null);
      setSuccessMsg("Gemini API key removed — Soma AI disabled for this school");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiDeleting(false);
    }
  }

  async function handleAiTest() {
    setAiTesting(true); setAiTestResult(null); setAiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/gemini-key/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await res.json();
      setAiTestResult(j);
    } catch (e: unknown) {
      setAiTestResult({ ok: false, error: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setAiTesting(false);
    }
  }

  async function handleSmsSave(e: React.FormEvent) {
    e.preventDefault();
    if (!smsKey.trim() || !smsClientId.trim() || !smsSenderId.trim()) return;
    setSmsSaving(true); setSmsError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/sms-config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apiKey:   smsKey.trim(),
          clientId: smsClientId.trim(),
          senderId: smsSenderId.trim(),
        }),
      });
      const j = await res.json() as { config?: SchoolSmsConfig; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save SMS credentials");
      setSmsConfig(j.config ?? null);
      setSmsKey(""); setShowSmsKey(false);
      setSuccessMsg("School SMS credentials saved");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: unknown) {
      setSmsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSmsSaving(false);
    }
  }

  async function handleSmsRemove() {
    if (!confirm(`Remove the SMS credentials for "${data?.name}"?\n\nThis school will not be able to send any SMS until new credentials are saved.`)) return;
    setSmsRemoving(true); setSmsError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/sms-config`, { method: "DELETE" });
      const j = await res.json() as { config?: SchoolSmsConfig; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to remove SMS credentials");
      setSmsConfig(j.config ?? null);
      setSmsClientId(""); setSmsSenderId("");
      setSuccessMsg("School SMS credentials removed");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: unknown) {
      setSmsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSmsRemoving(false);
    }
  }

  async function handleStatusChange(status: "SUSPENDED" | "ACTIVE") {
    setBusy(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setSuccessMsg(status === "SUSPENDED" ? "School suspended" : "School reactivated");
      await load();
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  async function handleModuleToggle(module: string, enabled: boolean) {
    setModulesBusy(module); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/modules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: id, module, enabled }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to toggle module");
      await load();
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setModulesBusy(null);
    }
  }

  async function handleImpersonate() {
    setImpersonating(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}/impersonate`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Impersonation failed");
      router.push(j.redirectTo);
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
      setImpersonating(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }
  if (!data) {
    return <ErrorBanner message={apiError ?? "School not found"} />;
  }

  const meta    = data.schoolMeta;
  const status  = meta?.status ?? "ONBOARDING";
  const usedBytes = (data.storageUsages ?? []).reduce((a: number, u: StorageUsage) => a + Number(u.sizeBytes), 0);
  const usedGb  = usedBytes / (1024 ** 3);
  const quotaGb = meta?.storageQuotaGb ?? 5;
  const pct     = Math.min((usedGb / quotaGb) * 100, 100);

  // Build enabled modules map
  const enabledMap: Record<string, boolean> = {};
  for (const t of (data.schoolModuleToggles ?? [])) {
    enabledMap[t.module] = t.enabled;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/super-admin/schools"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to Schools
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-teal-50 shrink-0">
            <Building2 className="h-6 w-6 text-teal" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">{data.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={status} />
              {meta?.slug && (
                <span className="text-xs font-mono text-slate">/{meta.slug}</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleImpersonate}
            disabled={impersonating || busy}
            className={`${secondaryButtonClass} text-xs`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {impersonating ? "Opening…" : "Impersonate Admin"}
          </button>
          {status === "SUSPENDED" ? (
            <button
              type="button"
              onClick={() => handleStatusChange("ACTIVE")}
              disabled={busy}
              className={`${primaryButtonClass} text-xs`}
            >
              <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Reactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStatusChange("SUSPENDED")}
              disabled={busy}
              className={`${dangerButtonClass} text-xs`}
            >
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Suspend
            </button>
          )}
        </div>
      </div>

      {apiError  && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Students",    value: data._count?.students ?? 0, Icon: GraduationCap, bg: "bg-info-bg",     text: "text-info"    },
          { label: "Staff",       value: data._count?.teachers ?? 0, Icon: Users,         bg: "bg-success-bg",  text: "text-success" },
          { label: "Storage",     value: `${usedGb.toFixed(1)} / ${quotaGb} GB`, Icon: HardDrive, bg: "bg-warn-bg", text: "text-warn" },
          { label: "Open Errors", value: (data.systemErrors ?? []).filter((e) => e.status !== "RESOLVED").length,
            Icon: AlertTriangle, bg: "bg-danger-bg", text: "text-danger" },
        ].map(({ label, value, Icon, bg, text }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 shadow-xs">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-2`}>
              <Icon className={`h-4.5 w-4.5 ${text}`} strokeWidth={1.8} aria-hidden />
            </div>
            <p className="text-lg font-semibold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
            <p className="text-xs text-slate">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-0 overflow-x-auto" aria-label="School detail tabs">
          {TABS.map(({ id: tid, label, Icon }) => (
            <button
              key={tid}
              type="button"
              onClick={() => setTab(tid)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${tab === tid
                  ? "border-teal text-teal"
                  : "border-transparent text-slate hover:text-foreground hover:border-slate-200"
                }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-5">
          <Card className="">
            <h3 className="text-sm font-semibold text-foreground mb-4">School Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                { label:"Name",           value: data.name },
                { label:"Address",        value: data.address ?? "—" },
                { label:"Email",          value: data.email ?? "—" },
                { label:"Contact Person", value: meta?.contactPerson ?? "—" },
                { label:"Contact Email",  value: meta?.contactEmail ?? "—" },
                { label:"Contact Phone",  value: meta?.contactPhone ?? "—" },
                { label:"Onboarded",      value: new Date(data.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}) },
                { label:"Slug",           value: meta?.slug ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate font-medium">{label}</dt>
                  <dd className="text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

        </div>
      )}

      {/* ERRORS TAB */}
      {tab === "errors" && (
        <div className="rounded-xl border border-border overflow-hidden shadow-xs">
          {(data.systemErrors ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-slate">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <p className="text-sm">No errors for this school</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-border ">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">Message</th>
                  <th className="px-5 py-3.5 text-left">Severity</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Module</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">Status</th>
                  <th className="px-5 py-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {(data.systemErrors ?? []).map((err) => (
                  <tr key={err.id}
                    onClick={() => router.push(`/super-admin/errors?id=${err.id}`)}
                    className="cursor-pointer hover:bg-slate-50/50/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-foreground max-w-xs truncate">{err.message}</td>
                    <td className="px-5 py-3.5"><SeverityBadge severity={err.severity} /></td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate font-mono">{err.module ?? "—"}</td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <Badge variant={err.status === "RESOLVED" ? "success" : "warn"}>{err.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate text-right whitespace-nowrap">
                      {new Date(err.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* STORAGE TAB */}
      {tab === "storage" && (
        <Card className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Storage Usage</h3>
          <ProgressBar
            value={pct} max={100} size="md" animated showLabel
            variant={pct > 90 ? "danger" : pct > 70 ? "warn" : "teal"}
          />
          <p className="text-sm text-slate">
            {usedGb.toFixed(2)} GB used of {quotaGb} GB quota
          </p>
          {/* Breakdown by type */}
          {(data.storageUsages ?? []).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {["documents","media","database","backups"].map(type => {
                const bytes = (data.storageUsages ?? [])
                  .filter((u) => u.type === type)
                  .reduce((a: number, u: StorageUsage) => a + Number(u.sizeBytes), 0);
                const gb = bytes / (1024 ** 3);
                const p  = quotaGb > 0 ? (gb / quotaGb) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-slate capitalize">{type}</span>
                    <ProgressBar value={p} max={100} size="sm" variant="teal" className="flex-1" />
                    <span className="text-xs text-slate w-16 text-right tabular-nums">
                      {gb.toFixed(2)} GB
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* MODULES TAB */}
      {tab === "modules" && (
        <Card className="">
          <h3 className="text-sm font-semibold text-foreground mb-1">Optional Modules</h3>
          <p className="text-xs text-slate mb-4 leading-relaxed">
            Turning one off removes it from this school entirely — it disappears from
            every dashboard and its pages stop existing. Records are kept and return
            untouched if it is turned back on. Every other module is always included.
          </p>
          <div className="space-y-3">
            {OPTIONAL_MODULES.map(mod => {
              // No stored row means the module is on.
              const stored  = enabledMap[mod.systemModule];
              const enabled = stored === undefined ? true : stored;
              const loading = modulesBusy === mod.id;

              return (
                <div key={mod.id}
                  className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{mod.label}</p>
                    <p className="text-xs text-slate mt-0.5">{mod.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {loading && <Spinner size="sm" />}
                    <Toggle
                      checked={enabled}
                      onChange={v => handleModuleToggle(mod.id, v)}
                      disabled={loading}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* IMPORTS TAB */}
      {tab === "imports" && (
        <div className="rounded-xl border border-border overflow-hidden shadow-xs">
          {(data.importJobs ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-slate">
              <Upload className="h-6 w-6 opacity-40" />
              <p className="text-sm">No imports yet for this school</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-border ">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">File</th>
                  <th className="px-5 py-3.5 text-left">Type</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Rows</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {(data.importJobs ?? []).map((job) => (
                  <tr key={job.id}
                    onClick={() => router.push(`/super-admin/imports?school=${id}`)}
                    className="cursor-pointer hover:bg-slate-50/50/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-foreground truncate max-w-[200px]">{job.fileName}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant="teal">{job.type}</Badge>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate">
                      {job.succeeded}/{job.totalRows} ok
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warn"}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate text-right whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SMS WALLET tab ── */}
      {tab === "sms" && (
        <div className="space-y-6 max-w-2xl">
          {smsError && <ErrorBanner message={smsError} onDismiss={() => setSmsError(null)} />}

          {smsLoading && !smsConfig ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : (
            <>
              {/* Current credential status */}
              <div className={`flex items-start gap-4 rounded-xl border p-5 ${
                smsConfig?.configured && smsConfig.isActive
                  ? "bg-success-bg border-success/20"
                  : "bg-warn-bg border-warn/20"
              }`}>
                <MessageSquare className={`h-6 w-6 shrink-0 mt-0.5 ${
                  smsConfig?.configured && smsConfig.isActive ? "text-success" : "text-warn"
                }`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    smsConfig?.configured && smsConfig.isActive ? "text-success" : "text-warn"
                  }`}>
                    {smsConfig?.configured
                      ? `SMS API key active · ···${smsConfig.keyPreview}`
                      : "No SMS API key assigned"}
                  </p>
                  <p className="text-xs text-foreground/70 mt-0.5">
                    {smsConfig?.configured
                      ? `Sender ID: ${smsConfig.senderId ?? "—"} · Client ID: ${smsConfig.clientId ?? "—"}`
                      : "This school cannot send SMS until its own credentials are saved below."}
                  </p>
                  {smsConfig?.updatedAt && (
                    <p className="text-xs text-foreground/60 mt-1">
                      Last updated {new Date(smsConfig.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {smsConfig?.configured && (
                  <button
                    type="button"
                    onClick={handleSmsRemove}
                    disabled={smsRemoving}
                    className={`${dangerButtonClass} text-xs shrink-0`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {smsRemoving ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>

              {/* Credentials form */}
              <form onSubmit={handleSmsSave} className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {smsConfig?.configured ? "Replace credentials" : "Set credentials"}
                  </h3>
                  <p className="text-xs text-slate mt-1">
                    This school&apos;s own SMSMobivas account. Everything the Communication
                    Centre sends for {data.name} is billed to it — top-ups and balance live in
                    that Mobivas dashboard, not here.
                  </p>
                </div>

                <div>
                  <label htmlFor="school-sms-key" className="block text-xs font-medium text-slate mb-1">
                    API Key <span className="text-danger" aria-hidden>*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="school-sms-key"
                      type={showSmsKey ? "text" : "password"}
                      autoComplete="off"
                      required
                      value={smsKey}
                      onChange={(e) => setSmsKey(e.target.value)}
                      placeholder={smsConfig?.configured ? "Enter a new key to replace the current one" : "Paste this school’s SMSMobivas API key"}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground
                                 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmsKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-foreground p-1"
                      aria-label={showSmsKey ? "Hide API key" : "Show API key"}
                    >
                      {showSmsKey ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate">
                    Encrypted with AES-256-GCM before saving — never stored or shown in plaintext.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="school-sms-client" className="block text-xs font-medium text-slate mb-1">
                      Client ID <span className="text-danger" aria-hidden>*</span>
                    </label>
                    <input
                      id="school-sms-client"
                      type="text"
                      autoComplete="off"
                      required
                      value={smsClientId}
                      onChange={(e) => setSmsClientId(e.target.value)}
                      placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground
                                 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="school-sms-sender" className="block text-xs font-medium text-slate mb-1">
                      Sender ID <span className="text-danger" aria-hidden>*</span>
                    </label>
                    <input
                      id="school-sms-sender"
                      type="text"
                      autoComplete="off"
                      required
                      value={smsSenderId}
                      onChange={(e) => setSmsSenderId(e.target.value)}
                      placeholder="e.g. SCHOOLNAME"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground
                                 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={smsSaving || !smsKey.trim() || !smsClientId.trim() || !smsSenderId.trim()}
                  className={`${primaryButtonClass} text-sm`}
                >
                  {smsSaving ? <><Spinner size="sm" /> Saving…</> : <><Key className="h-4 w-4" aria-hidden /> Save credentials</>}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ── SOMA AI TAB ── */}
      {tab === "somaai" && (
        <div className="space-y-6 max-w-2xl">
          {aiError && (
            <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
              {aiError}
            </div>
          )}

          {aiLoading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : (
            <>
              {/* ── Key status card ────────────────────────────────────── */}
              <div className={`flex items-start gap-4 rounded-xl border p-5 ${
                aiStatus?.configured
                  ? "bg-success-bg border-success/20"
                  : "bg-warn-bg border-warn/20"
              }`}>
                {aiStatus?.configured
                  ? <ShieldCheck className="h-6 w-6 text-success shrink-0 mt-0.5" />
                  : <Sparkles    className="h-6 w-6 text-warn shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${aiStatus?.configured ? "text-success" : "text-warn"}`}>
                    {aiStatus?.configured
                      ? `Gemini API key active · ···${aiStatus.keyPreview}`
                      : "No Gemini API key assigned"}
                  </p>
                  <p className="text-xs text-foreground/70 mt-0.5">
                    {aiStatus?.configured
                      ? `Soma AI is ${aiStatus.config.enabled ? "enabled" : "paused"} · Model: ${aiStatus.config.model}`
                      : "Assign a key below to enable Soma AI for this school."}
                  </p>
                  {aiStatus?.configured && (
                    <p className="text-xs text-foreground/60 mt-1">
                      {aiStatus.usage.totalRequests.toLocaleString()} total requests
                      {aiStatus.usage.lastUsedAt
                        ? ` · Last used ${new Date(aiStatus.usage.lastUsedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`
                        : " · Never used"}
                    </p>
                  )}
                </div>
                {aiStatus?.configured && (
                  <button
                    type="button"
                    onClick={handleAiKeyDelete}
                    disabled={aiDeleting}
                    title="Remove Gemini key"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-danger/30
                               text-danger hover:bg-danger-bg/60 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {aiDeleting
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {/* ── Assign / Replace key form ──────────────────────────── */}
              <div className="rounded-xl bg-card border border-border p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-teal/10 shrink-0">
                    <Key className="h-4 w-4 text-teal" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {aiStatus?.configured ? "Replace API Key" : "Assign API Key"}
                    </p>
                    <p className="text-xs text-slate">
                      {aiStatus?.configured
                        ? "Enter a new key to replace the current one"
                        : "Paste the Google Gemini API key for this school"}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAiKeySave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate uppercase tracking-wide mb-1.5">
                      Gemini API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showAiKey ? "text" : "password"}
                        value={aiKey}
                        onChange={(e) => setAiKey(e.target.value)}
                        placeholder={aiStatus?.configured ? "Enter new key to replace current" : "AIza..."}
                        className="block w-full rounded-lg border border-border bg-background px-3 py-2 pr-10
                                   text-sm text-foreground placeholder:text-slate/50
                                   focus:border-teal/60 focus:outline-none focus:ring-1 focus:ring-teal/20"
                        autoComplete="off"
                        spellCheck={false}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAiKey((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate hover:text-foreground transition-colors"
                        aria-label={showAiKey ? "Hide key" : "Show key"}
                      >
                        {showAiKey
                          ? <EyeOff className="h-4 w-4" />
                          : <Eye    className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate">
                      Key is AES-256 encrypted before storage. Only the last 4 characters are stored for display.
                      Get a key from{" "}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal hover:underline"
                      >
                        Google AI Studio →
                      </a>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={aiSaving || !aiKey.trim()}
                      className={`${primaryButtonClass} text-sm`}
                    >
                      {aiSaving
                        ? <><Spinner size="sm" /> Saving…</>
                        : <><Key className="h-4 w-4" />{aiStatus?.configured ? "Replace key" : "Save key"}</>}
                    </button>
                    {aiSaved && (
                      <span className="flex items-center gap-1.5 text-sm text-success font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Key saved
                      </span>
                    )}
                  </div>
                </form>
              </div>

              {/* ── Connection test ────────────────────────────────────── */}
              {aiStatus?.configured && (
                <div className="rounded-xl bg-card border border-border p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-teal/10 shrink-0">
                        <RefreshCw className="h-4 w-4 text-teal" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Test Connection</p>
                        <p className="text-xs text-slate">Verify the key reaches Google Gemini</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAiTest}
                      disabled={aiTesting}
                      className={`${secondaryButtonClass} text-sm`}
                    >
                      {aiTesting
                        ? <><RefreshCw className="h-4 w-4 animate-spin" />Testing…</>
                        : <><RefreshCw className="h-4 w-4" />Test</>}
                    </button>
                  </div>

                  {aiTestResult && (
                    <div className={`mt-4 flex items-start gap-2.5 rounded-lg p-3 border text-sm ${
                      aiTestResult.ok
                        ? "bg-success-bg border-success/20 text-success"
                        : "bg-danger-bg border-danger/20 text-danger"
                    }`}>
                      {aiTestResult.ok
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        : <Sparkles     className="h-4 w-4 shrink-0 mt-0.5" />}
                      <div>
                        {aiTestResult.ok ? (
                          <>
                            <p className="font-semibold">Connection successful</p>
                            <p className="text-xs opacity-80 mt-0.5">
                              Model: {aiTestResult.model} · {aiTestResult.latencyMs}ms
                            </p>
                          </>
                        ) : (
                          <p>{aiTestResult.error}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
