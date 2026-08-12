"use client";

/**
 * /super-admin/modules — Module Management
 *
 * Master toggle grid: schools as rows, modules as columns.
 * Plan-tier bundle quick-apply per school.
 * Dependency validation inline before saving.
 * Audit trail tab: who toggled what, for which school, when.
 */

import { useEffect, useState, useCallback } from "react";
import { Puzzle, RefreshCw, Search, History, LayoutGrid, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Badge,
  secondaryButtonClass,
} from "@/components/ui";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  "ATTENDANCE","GRADING","REPORTS","IMPORT_TOOL","MESSAGING",
  "LIBRARY","TIMETABLE","FEE_MANAGEMENT","ACCOMMODATION","ANALYTICS","AI_TOOLS","TRANSPORT",
] as const;
type Mod = (typeof ALL_MODULES)[number];

const MODULE_LABEL: Record<Mod, string> = {
  ATTENDANCE:"Attendance", GRADING:"Grading", REPORTS:"Reports",
  IMPORT_TOOL:"Import", MESSAGING:"Messaging", LIBRARY:"Library",
  TIMETABLE:"Timetable", FEE_MANAGEMENT:"Fees",
  ACCOMMODATION:"Boarding", ANALYTICS:"Analytics",
  AI_TOOLS:"AI", TRANSPORT:"Transport",
};

const MODULE_DEPS: Record<string, string[]> = {
  GRADING:["ATTENDANCE"], REPORTS:["GRADING"],
  ANALYTICS:["GRADING"],  AI_TOOLS:["GRADING"],
};

const PLAN_BUNDLES: Record<string, Mod[]> = {
  FREE:         ["ATTENDANCE"],
  STARTER:      ["ATTENDANCE","GRADING","REPORTS","IMPORT_TOOL"],
  GROWTH:       ["ATTENDANCE","GRADING","REPORTS","IMPORT_TOOL","MESSAGING","LIBRARY","TIMETABLE"],
  PROFESSIONAL: ["ATTENDANCE","GRADING","REPORTS","IMPORT_TOOL","MESSAGING","LIBRARY",
                 "TIMETABLE","FEE_MANAGEMENT","ACCOMMODATION","ANALYTICS"],
  ENTERPRISE:   [...ALL_MODULES],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchoolRow {
  id: string;
  name: string;
  schoolMeta: { planTier: string; status: string } | null;
}

interface Toggle {
  schoolId: string;
  module: string;
  enabled: boolean;
}

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: any;
  createdAt: string;
}

// ── Toggle cell ───────────────────────────────────────────────────────────────

function ToggleCell({
  enabled, busy, blocked, missingLabel,
  onChange,
}: {
  enabled: boolean; busy: boolean; blocked: boolean; missingLabel: string;
  onChange: (v: boolean) => void;
}) {
  if (busy) {
    return (
      <div className="flex justify-center">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5" title={blocked ? `Requires: ${missingLabel}` : undefined}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={blocked && !enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-1
                    ${enabled ? "bg-teal" : blocked ? "bg-slate-200 cursor-not-allowed" : "bg-line hover:bg-slate-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                          transition-transform duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
      </button>
      {blocked && !enabled && (
        <AlertTriangle className="h-2.5 w-2.5 text-warn" aria-hidden="true" />
      )}
    </div>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────

function PlanBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    FREE:"bg-slate-100 text-slate border-line",
    STARTER:"bg-teal-50 text-teal border-teal/20",
    GROWTH:"bg-info-bg text-info border-info/20",
    PROFESSIONAL:"bg-warn-bg text-warn border-warn/20",
    ENTERPRISE:"bg-danger-bg text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide ${map[tier] ?? "bg-slate-100 text-slate border-line"}`}>
      {tier.slice(0,3)}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = "grid" | "audit";

export default function ModulesPage() {
  const [schools, setSchools]   = useState<SchoolRow[]>([]);
  const [toggles, setToggles]   = useState<Toggle[]>([]);
  const [audit, setAudit]       = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null); // "schoolId:module"
  const [q, setQ]               = useState("");
  const [tab, setTab]           = useState<TabId>("grid");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/modules");
      if (!res.ok) throw new Error("Failed to load modules");
      const j = await res.json();
      setSchools(j.schools ?? []);
      setToggles(j.toggles ?? []);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/super-admin/audit?action=MODULE_TOGGLED&limit=100");
      if (!res.ok) throw new Error("Failed to load audit");
      const j = await res.json();
      setAudit(j.logs ?? []);
    } catch {
      // non-fatal
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "audit") loadAudit(); }, [tab, loadAudit]);

  function isEnabled(schoolId: string, module: string) {
    return toggles.find(t => t.schoolId === schoolId && t.module === module)?.enabled ?? false;
  }

  function isBlocked(schoolId: string, module: string) {
    const deps = MODULE_DEPS[module] ?? [];
    return deps.some(d => !isEnabled(schoolId, d));
  }

  async function handleToggle(schoolId: string, module: string, enabled: boolean) {
    const key = `${schoolId}:${module}`;
    setBusyCell(key); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/modules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, module, enabled }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Toggle failed");
      // Optimistic update
      setToggles(prev => {
        const filtered = prev.filter(t => !(t.schoolId === schoolId && t.module === module));
        return [...filtered, { schoolId, module, enabled }];
      });
      setSuccessMsg(null);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCell(null);
    }
  }

  async function applyBundle(schoolId: string, planTier: string) {
    const bundle = PLAN_BUNDLES[planTier] ?? [];
    setApiError(null);
    // Apply all in sequence (respect deps order)
    for (const mod of ALL_MODULES) {
      const shouldEnable = bundle.includes(mod as Mod);
      const currently    = isEnabled(schoolId, mod);
      if (shouldEnable !== currently) {
        const key = `${schoolId}:${mod}`;
        setBusyCell(key);
        try {
          await fetch("/api/super-admin/modules", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schoolId, module: mod, enabled: shouldEnable }),
          });
          setToggles(prev => {
            const f = prev.filter(t => !(t.schoolId === schoolId && t.module === mod));
            return [...f, { schoolId, module: mod, enabled: shouldEnable }];
          });
        } catch { /* skip */ }
        setBusyCell(null);
      }
    }
    setSuccessMsg("Bundle applied");
    setTimeout(() => setSuccessMsg(null), 2000);
  }

  const filtered = schools.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Module Management"
        description="Toggle platform features per school. Plan bundles pre-configure module sets."
      />

      {apiError  && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-line dark:border-dark-border flex gap-0">
        {([
          { id: "grid"  as TabId, label: "Toggle Grid",  Icon: LayoutGrid },
          { id: "audit" as TabId, label: "Audit Trail",  Icon: History    },
        ]).map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === id ? "border-teal text-teal" : "border-transparent text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* TOGGLE GRID TAB */}
      {tab === "grid" && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
              <input type="search" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Filter schools…"
                className="w-full rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                           pl-10 pr-4 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                           focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />
            </div>
            <button type="button" onClick={load} className={`${secondaryButtonClass} shrink-0`}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2 text-slate dark:text-dark-muted">
              <Puzzle className="h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">No schools found</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  {/* Module column headers */}
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-dark-surface border-b border-line dark:border-dark-border">
                      {/* School + plan col */}
                      <th className="sticky left-0 z-10 bg-slate-50/80 dark:bg-dark-surface px-4 py-3 text-left
                                     text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide
                                     min-w-[200px] border-r border-line dark:border-dark-border">
                        School
                      </th>
                      {/* Apply bundle col */}
                      <th className="px-3 py-3 text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide
                                     whitespace-nowrap border-r border-line dark:border-dark-border min-w-[110px]">
                        Apply Bundle
                      </th>
                      {/* Module cols */}
                      {ALL_MODULES.map(mod => (
                        <th key={mod}
                          className="px-3 py-3 text-center text-[10px] font-semibold text-slate dark:text-dark-muted
                                     uppercase tracking-wide whitespace-nowrap min-w-[72px]">
                          {MODULE_LABEL[mod]}
                          {(MODULE_DEPS[mod] ?? []).length > 0 && (
                            <span className="block text-[8px] font-normal text-slate/50 dark:text-dark-muted/50 mt-0.5 normal-case tracking-normal">
                              needs {(MODULE_DEPS[mod] ?? []).map(d => MODULE_LABEL[d as Mod]).join("+")}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                    {filtered.map(school => {
                      const planTier = school.schoolMeta?.planTier ?? "FREE";
                      return (
                        <tr key={school.id}
                          className="hover:bg-slate-50/40 dark:hover:bg-dark-border/20 transition-colors">
                          {/* School name + plan */}
                          <td className="sticky left-0 z-10 bg-white dark:bg-dark-surface px-4 py-3
                                         border-r border-line dark:border-dark-border">
                            <p className="text-sm font-medium text-ink dark:text-dark-text truncate max-w-[160px]">
                              {school.name}
                            </p>
                            <div className="mt-0.5">
                              <PlanBadge tier={planTier} />
                            </div>
                          </td>
                          {/* Quick-apply bundle */}
                          <td className="px-3 py-3 border-r border-line dark:border-dark-border">
                            <button
                              type="button"
                              onClick={() => applyBundle(school.id, planTier)}
                              className="text-[10px] font-semibold text-teal hover:underline whitespace-nowrap"
                            >
                              Apply {planTier.slice(0,3)} bundle
                            </button>
                          </td>
                          {/* Toggle cells */}
                          {ALL_MODULES.map(mod => {
                            const enabled  = isEnabled(school.id, mod);
                            const blocked  = isBlocked(school.id, mod);
                            const busyKey  = `${school.id}:${mod}`;
                            const isBusy   = busyCell === busyKey;
                            const missDeps = (MODULE_DEPS[mod] ?? [])
                              .filter(d => !isEnabled(school.id, d))
                              .map(d => MODULE_LABEL[d as Mod])
                              .join(", ");

                            return (
                              <td key={mod} className="px-3 py-3 text-center">
                                <ToggleCell
                                  enabled={enabled}
                                  busy={isBusy}
                                  blocked={blocked && !enabled}
                                  missingLabel={missDeps}
                                  onChange={v => handleToggle(school.id, mod, v)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate dark:text-dark-muted pt-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-4 w-7 rounded-full bg-teal" />
              Enabled
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-4 w-7 rounded-full bg-line" />
              Disabled
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />
              Dependency not met
            </div>
          </div>
        </>
      )}

      {/* AUDIT TRAIL TAB */}
      {tab === "audit" && (
        auditLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : audit.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-slate dark:text-dark-muted">
            <History className="h-8 w-8 opacity-40" aria-hidden />
            <p className="text-sm">No module toggle events yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">Action</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Module</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">School ID</th>
                  <th className="px-5 py-3.5 text-left">Enabled?</th>
                  <th className="px-5 py-3.5 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {audit.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/40 dark:hover:bg-dark-border/20 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-mono text-ink dark:text-dark-text">{entry.action}</td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate dark:text-dark-muted font-mono">
                      {entry.metadata?.module ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate dark:text-dark-muted font-mono truncate max-w-[140px]">
                      {entry.targetId ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={entry.metadata?.enabled ? "success" : "warn"}>
                        {entry.metadata?.enabled ? "On" : "Off"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate dark:text-dark-muted text-right whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString("en-GB", {
                        day:"2-digit", month:"short", year:"numeric",
                        hour:"2-digit", minute:"2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
