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
  PlayCircle, ExternalLink, CheckCircle2,
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${map[status] ?? "bg-slate-100 text-slate border-line"}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-danger-bg text-danger border-danger/20",
    HIGH:     "bg-orange-50 text-orange-600 border-orange-200",
    MEDIUM:   "bg-warn-bg text-warn border-warn/20",
    LOW:      "bg-slate-100 text-slate border-line",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[severity] ?? "bg-slate-100 text-slate border-line"}`}>
      {severity}
    </span>
  );
}

const PLAN_TIERS = ["FREE","STARTER","GROWTH","PROFESSIONAL","ENTERPRISE"] as const;
const ALL_MODULES = [
  "ATTENDANCE","GRADING","REPORTS","IMPORT_TOOL","MESSAGING",
  "LIBRARY","TIMETABLE","FEE_MANAGEMENT","ACCOMMODATION","ANALYTICS","AI_TOOLS","TRANSPORT",
];
const MODULE_LABEL: Record<string, string> = {
  ATTENDANCE:"Attendance", GRADING:"Grading", REPORTS:"Reports",
  IMPORT_TOOL:"Import Tool", MESSAGING:"Messaging", LIBRARY:"Library",
  TIMETABLE:"Timetable", FEE_MANAGEMENT:"Fee Management",
  ACCOMMODATION:"Accommodation", ANALYTICS:"Analytics",
  AI_TOOLS:"AI Tools", TRANSPORT:"Transport",
};
const MODULE_DEPS: Record<string, string[]> = {
  GRADING:["ATTENDANCE"], REPORTS:["GRADING"], ANALYTICS:["GRADING"], AI_TOOLS:["GRADING"],
};

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id:"overview",  label:"Overview",  Icon: Building2      },
  { id:"errors",    label:"Errors",    Icon: AlertTriangle  },
  { id:"storage",   label:"Storage",   Icon: HardDrive      },
  { id:"modules",   label:"Modules",   Icon: Puzzle         },
  { id:"imports",   label:"Imports",   Icon: Upload         },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── Main page ─────────────────────────────────────────────────────────────────
interface SchoolMetaShape {
  slug?:          string | null;
  status:        string;
  planTier:      string;
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
  const [editPlan, setEditPlan] = useState(false);
  const [newPlan, setNewPlan]   = useState("");
  const [modulesBusy, setModulesBusy] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}`);
      if (!res.ok) throw new Error("Failed to load school");
      const j = await res.json();
      setData(j.school);
      setNewPlan(j.school?.schoolMeta?.planTier ?? "STARTER");
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  async function handlePlanUpdate() {
    setBusy(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planTier: newPlan }),
      });
      if (!res.ok) throw new Error("Failed to update plan");
      setEditPlan(false);
      setSuccessMsg("Plan tier updated");
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
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to Schools
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-teal-50 shrink-0">
            <Building2 className="h-6 w-6 text-teal" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink dark:text-dark-text truncate">{data.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={status} />
              {meta?.planTier && (
                <span className="text-xs text-slate dark:text-dark-muted">{meta.planTier} plan</span>
              )}
              {meta?.slug && (
                <span className="text-xs font-mono text-slate dark:text-dark-muted">/{meta.slug}</span>
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
          <div key={label} className="bg-card border border-line dark:bg-dark-surface dark:border-dark-border rounded-xl p-4 shadow-xs">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-2`}>
              <Icon className={`h-4.5 w-4.5 ${text}`} strokeWidth={1.8} aria-hidden />
            </div>
            <p className="text-lg font-semibold text-ink dark:text-dark-text">{typeof value === "number" ? value.toLocaleString() : value}</p>
            <p className="text-xs text-slate dark:text-dark-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-line dark:border-dark-border">
        <nav className="-mb-px flex gap-0 overflow-x-auto" aria-label="School detail tabs">
          {TABS.map(({ id: tid, label, Icon }) => (
            <button
              key={tid}
              type="button"
              onClick={() => setTab(tid)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${tab === tid
                  ? "border-teal text-teal"
                  : "border-transparent text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text hover:border-slate-200"
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
          <Card className="dark:bg-dark-surface dark:border-dark-border">
            <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-4">School Details</h3>
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
                  <dt className="w-32 shrink-0 text-slate dark:text-dark-muted font-medium">{label}</dt>
                  <dd className="text-ink dark:text-dark-text">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Plan tier editor */}
          <Card className="dark:bg-dark-surface dark:border-dark-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Plan Tier</h3>
              {!editPlan && (
                <button type="button" onClick={() => setEditPlan(true)} className="text-xs text-teal font-medium hover:underline">
                  Edit
                </button>
              )}
            </div>
            {editPlan ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {PLAN_TIERS.map(tier => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setNewPlan(tier)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-all
                        ${newPlan === tier ? "border-teal bg-teal-50 text-teal" : "border-line text-slate hover:border-teal/40"}`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={handlePlanUpdate} disabled={busy} className={`${primaryButtonClass} text-xs`}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditPlan(false)} className={`${secondaryButtonClass} text-xs`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-ink dark:text-dark-text">{meta?.planTier ?? "FREE"}</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ERRORS TAB */}
      {tab === "errors" && (
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          {(data.systemErrors ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-slate dark:text-dark-muted">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <p className="text-sm">No errors for this school</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">Message</th>
                  <th className="px-5 py-3.5 text-left">Severity</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Module</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">Status</th>
                  <th className="px-5 py-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {(data.systemErrors ?? []).map((err) => (
                  <tr key={err.id}
                    onClick={() => router.push(`/super-admin/errors?id=${err.id}`)}
                    className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dark-border/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-ink dark:text-dark-text max-w-xs truncate">{err.message}</td>
                    <td className="px-5 py-3.5"><SeverityBadge severity={err.severity} /></td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate dark:text-dark-muted font-mono">{err.module ?? "—"}</td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <Badge variant={err.status === "RESOLVED" ? "success" : "warn"}>{err.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate dark:text-dark-muted text-right whitespace-nowrap">
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
        <Card className="dark:bg-dark-surface dark:border-dark-border space-y-4">
          <h3 className="text-sm font-semibold text-ink dark:text-dark-text">Storage Usage</h3>
          <ProgressBar
            value={pct} max={100} size="md" animated showLabel
            variant={pct > 90 ? "danger" : pct > 70 ? "warn" : "teal"}
          />
          <p className="text-sm text-slate dark:text-dark-muted">
            {usedGb.toFixed(2)} GB used of {quotaGb} GB quota
          </p>
          {/* Breakdown by type */}
          {(data.storageUsages ?? []).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-line dark:border-dark-border">
              {["documents","media","database","backups"].map(type => {
                const bytes = (data.storageUsages ?? [])
                  .filter((u) => u.type === type)
                  .reduce((a: number, u: StorageUsage) => a + Number(u.sizeBytes), 0);
                const gb = bytes / (1024 ** 3);
                const p  = quotaGb > 0 ? (gb / quotaGb) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-slate dark:text-dark-muted capitalize">{type}</span>
                    <ProgressBar value={p} max={100} size="sm" variant="teal" className="flex-1" />
                    <span className="text-xs text-slate dark:text-dark-muted w-16 text-right tabular-nums">
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
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-4">Module Toggles</h3>
          <div className="space-y-3">
            {ALL_MODULES.map(mod => {
              const enabled  = enabledMap[mod] ?? false;
              const deps     = MODULE_DEPS[mod] ?? [];
              const missingDeps = deps.filter(d => !(enabledMap[d] ?? false));
              const blocked  = !enabled && missingDeps.length > 0;
              const loading  = modulesBusy === mod;

              return (
                <div key={mod}
                  className="flex items-start justify-between gap-4 py-3 border-b border-line/60
                             dark:border-dark-border/60 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink dark:text-dark-text">
                      {MODULE_LABEL[mod] ?? mod}
                    </p>
                    {blocked && (
                      <p className="text-xs text-warn mt-0.5">
                        Requires: {missingDeps.map(d => MODULE_LABEL[d] ?? d).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {loading && <Spinner size="sm" />}
                    <Toggle
                      checked={enabled}
                      onChange={v => handleModuleToggle(mod, v)}
                      disabled={loading || blocked}
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
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          {(data.importJobs ?? []).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-slate dark:text-dark-muted">
              <Upload className="h-6 w-6 opacity-40" />
              <p className="text-sm">No imports yet for this school</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">File</th>
                  <th className="px-5 py-3.5 text-left">Type</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Rows</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {(data.importJobs ?? []).map((job) => (
                  <tr key={job.id}
                    onClick={() => router.push(`/super-admin/imports?school=${id}`)}
                    className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dark-border/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-ink dark:text-dark-text truncate max-w-[200px]">{job.fileName}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant="teal">{job.type}</Badge>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate dark:text-dark-muted">
                      {job.succeeded}/{job.totalRows} ok
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warn"}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate dark:text-dark-muted text-right whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
