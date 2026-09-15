"use client";

/**
 * /super-admin/modules — Module Management
 *
 * Three modules are optional and can be switched on or off per school:
 * Library, Finance, and Accommodation. Everything else is core — it ships with
 * every school and has no switch.
 *
 * Switching one off removes it from that school completely: no sidebar entry,
 * no dashboard tile, no search result, and its pages answer 404. The school's
 * data is kept and returns untouched if the module is switched back on.
 *
 * Tabs: the school × module switch grid, and the audit trail of who changed
 * what and when.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Puzzle, RefreshCw, Search, History, LayoutGrid, CheckCircle2, Info,
} from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Badge,
  secondaryButtonClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModuleDef {
  id:          string;
  label:       string;
  description: string;
}

interface SchoolRow {
  id:   string;
  name: string;
  schoolMeta: { status: string } | null;
}

interface Toggle {
  schoolId: string;
  module:   string;   // SystemModule (LIBRARY | FEE_MANAGEMENT | ACCOMMODATION)
  enabled:  boolean;
}

interface AuditEntry {
  id:         string;
  adminId:    string;
  action:     string;
  targetType: string | null;
  targetId:   string | null;
  metadata:   Record<string, unknown>;
  createdAt:  string;
}

/** RBAC module id → the SystemModule its toggle row is stored under. */
const SYSTEM_MODULE: Record<string, string> = {
  LIBRARY:       "LIBRARY",
  FEES:          "FEE_MANAGEMENT",
  ACCOMMODATION: "ACCOMMODATION",
};

// ── Switch ────────────────────────────────────────────────────────────────────

function ModuleSwitch({
  enabled, busy, label, schoolName, onChange,
}: {
  enabled:    boolean;
  busy:       boolean;
  label:      string;
  schoolName: string;
  onChange:   (v: boolean) => void;
}) {
  if (busy) {
    return (
      <div className="flex justify-center">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} for ${schoolName}`}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none focus:ring-2
                    focus:ring-teal/30 focus:ring-offset-1
                    ${enabled ? "bg-teal" : "bg-line hover:bg-slate-200"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-card shadow
                      transition-transform duration-200
                      ${enabled ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = "grid" | "audit";

export default function ModulesPage() {
  const [schools, setSchools]           = useState<SchoolRow[]>([]);
  const [modules, setModules]           = useState<ModuleDef[]>([]);
  const [toggles, setToggles]           = useState<Toggle[]>([]);
  const [audit, setAudit]               = useState<AuditEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const [busyCell, setBusyCell]         = useState<string | null>(null); // "schoolId:module"
  const [q, setQ]                       = useState("");
  const [tab, setTab]                   = useState<TabId>("grid");
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/modules");
      if (!res.ok) throw new Error("Failed to load modules");
      const j = await res.json();
      setSchools(j.schools ?? []);
      setModules(j.modules ?? []);
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

  /**
   * A module with no stored row is on. Schools start with everything
   * available; a row only ever appears once someone switches it off.
   */
  function isEnabled(schoolId: string, moduleId: string): boolean {
    const systemModule = SYSTEM_MODULE[moduleId] ?? moduleId;
    const row = toggles.find(t => t.schoolId === schoolId && t.module === systemModule);
    return row ? row.enabled : true;
  }

  async function handleToggle(schoolId: string, moduleId: string, enabled: boolean) {
    const key = `${schoolId}:${moduleId}`;
    setBusyCell(key); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/modules", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ schoolId, module: moduleId, enabled }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not change this module");

      const systemModule = SYSTEM_MODULE[moduleId] ?? moduleId;
      setToggles(prev => [
        ...prev.filter(t => !(t.schoolId === schoolId && t.module === systemModule)),
        { schoolId, module: systemModule, enabled },
      ]);

      const school = schools.find(s => s.id === schoolId)?.name ?? "School";
      const label  = modules.find(m => m.id === moduleId)?.label ?? moduleId;
      setSuccessMsg(`${label} turned ${enabled ? "on" : "off"} for ${school}`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCell(null);
    }
  }

  const filtered = schools.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Module Management"
        description="Choose which optional modules each school can use. Everything else is included for every school."
      />

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-border flex gap-0">
        {([
          { id: "grid"  as TabId, label: "Modules",     Icon: LayoutGrid },
          { id: "audit" as TabId, label: "Audit Trail", Icon: History    },
        ]).map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === id ? "border-teal text-teal" : "border-transparent text-slate hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* MODULE GRID TAB */}
      {tab === "grid" && (
        <>
          {/* What the switches do */}
          <div className="flex items-start gap-2.5 rounded-xl bg-info-bg border border-info/20 px-4 py-3">
            <Info className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-info leading-relaxed">
              Turning a module off removes it from the school completely — staff and
              parents see no trace of it anywhere in their dashboards. Existing
              records are kept and come back untouched if it is turned on again.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
              <input type="search" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Filter schools…"
                className="w-full rounded-xl border border-border bg-card
                           pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-slate-light
                           focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />
            </div>
            <button type="button" onClick={load} aria-label="Refresh"
              className={`${secondaryButtonClass} shrink-0`}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2 text-slate">
              <Puzzle className="h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">No schools found</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-border">
                      <th className="sticky left-0 z-10 bg-slate-50/80 px-4 py-3 text-left
                                     text-xs font-semibold text-slate uppercase tracking-wide
                                     min-w-[220px] border-r border-border">
                        School
                      </th>
                      {modules.map(mod => (
                        <th key={mod.id}
                          className="px-4 py-3 text-center text-xs font-semibold text-slate
                                     uppercase tracking-wide whitespace-nowrap min-w-[140px]">
                          {mod.label}
                          <span className="block text-[10px] font-normal text-slate/60 mt-0.5 normal-case tracking-normal">
                            Optional
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {filtered.map(school => (
                      <tr key={school.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 border-r border-border">
                          <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                            {school.name}
                          </p>
                          {school.schoolMeta?.status && (
                            <p className="text-[11px] text-slate mt-0.5 capitalize">
                              {school.schoolMeta.status.toLowerCase().replace(/_/g, " ")}
                            </p>
                          )}
                        </td>
                        {modules.map(mod => {
                          const enabled = isEnabled(school.id, mod.id);
                          const busyKey = `${school.id}:${mod.id}`;
                          return (
                            <td key={mod.id} className="px-4 py-3">
                              <ModuleSwitch
                                enabled={enabled}
                                busy={busyCell === busyKey}
                                label={mod.label}
                                schoolName={school.name}
                                onChange={v => handleToggle(school.id, mod.id, v)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* What each switch controls */}
          {!loading && modules.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              {modules.map(mod => (
                <div key={mod.id} className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
                  <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                  <p className="text-xs text-slate mt-1 leading-relaxed">{mod.description}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* AUDIT TRAIL TAB */}
      {tab === "audit" && (
        auditLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : audit.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-slate">
            <History className="h-8 w-8 opacity-40" aria-hidden />
            <p className="text-sm">No module changes yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">Module</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">School ID</th>
                  <th className="px-5 py-3.5 text-left">State</th>
                  <th className="px-5 py-3.5 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {audit.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-foreground">
                      {String(entry.metadata?.label ?? entry.metadata?.module ?? "—")}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate font-mono truncate max-w-[160px]">
                      {entry.targetId ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={(entry.metadata?.enabled as boolean | undefined) ? "success" : "warn"}>
                        {(entry.metadata?.enabled as boolean | undefined) ? "Turned on" : "Turned off"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate text-right whitespace-nowrap">
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
