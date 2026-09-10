"use client";

/**
 * /principal/timetable/versions — Version Manager
 *
 * Lists all timetable versions (DRAFT, PUBLISHED, ARCHIVED).
 * Clicking any version row opens the VersionVulnerabilitiesPanel slide-in
 * that shows stored conflicts + staff shortage suggestions for that version.
 * A "Re-check" button re-runs validation live and refreshes the snapshot.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, MoreHorizontal, CheckCircle2, FileText, Archive,
  Copy, Trash2, Upload, DownloadCloud, Pencil,
  AlertCircle, AlertTriangle, RefreshCw, ShieldAlert, ChevronRight,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import Modal from "@/components/Modal";
import VersionVulnerabilitiesPanel from "@/components/timetable/VersionVulnerabilitiesPanel";
import {
  PageHeader, ErrorBanner, EmptyState,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";
import type { VersionVulnerabilities } from "@/lib/stores/timetableStore";

type ValidationGateState = {
  versionId:    string;
  errorCount:   number;
  warningCount: number;
  errors:       Array<{ message: string; action: string }>;
  validated:    boolean;
  validating:   boolean;
};

type Version = {
  id: string; name: string; description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  slotCount: number; createdAt: string; updatedAt: string;
  publishedAt: string | null; generatedAt: string | null;
  academicYear: string | null; term: number | null;
  clonedFromId: string | null;
  vulnerabilities: VersionVulnerabilities | null;
};

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-success-bg text-success border-success/20",
  DRAFT:     "bg-teal-50 text-teal border-teal-200",
  ARCHIVED:  "bg-background text-slate border-border",
};

/** Returns a concise health label for the vulnerability summary chip */
function vulnChip(v: Version): { label: string; cls: string } | null {
  const vuln = v.vulnerabilities;
  if (!vuln) return null;
  // Strip NO_CLASS_DOUBLE_BOOKING warnings — these were false positives from
  // the old validator; the solver enforces this constraint itself.
  const realWarnings = vuln.conflicts.filter(
    (c) => !(c.type === "NO_CLASS_DOUBLE_BOOKING" && c.severity === "warning")
  ).filter((c) => c.severity === "warning").length;
  if (vuln.totalErrors > 0)
    return {
      label: `${vuln.totalErrors} error${vuln.totalErrors !== 1 ? "s" : ""}`,
      cls:   "bg-danger/8 text-danger border-danger/20",
    };
  if (vuln.staffShortages?.length > 0)
    return {
      label: `${vuln.staffShortages.length} staffing gap${vuln.staffShortages.length !== 1 ? "s" : ""}`,
      cls:   "bg-blue-50 text-blue-700 border-blue-200",
    };
  if (realWarnings > 0)
    return {
      label: `${realWarnings} warning${realWarnings !== 1 ? "s" : ""}`,
      cls:   "bg-warn-bg text-warn border-warn/20",
    };
  return { label: "Clean", cls: "bg-success-bg text-success border-success/20" };
}

export default function VersionsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAY,   setCreateAY]   = useState("");
  const [createTerm, setCreateTerm] = useState("");
  const [creating,   setCreating]   = useState(false);

  // Clone modal
  const [cloneSource, setCloneSource] = useState<Version | null>(null);
  const [cloneName,   setCloneName]   = useState("");
  const [cloning,     setCloning]     = useState(false);

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<Version | null>(null);
  const [renameName,   setRenameName]   = useState("");
  const [renaming,     setRenaming]     = useState(false);

  // Action loading map
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Publish gate
  const [gate, setGate] = useState<ValidationGateState | null>(null);

  // Open kebab menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Vulnerabilities panel
  const [panelVersion,   setPanelVersion]   = useState<Version | null>(null);
  const [revalidating,   setRevalidating]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timetable/v2/versions");
      if (!res.ok) throw new Error("Failed to load versions.");
      setVersions(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpenMenu(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /** Re-run validation for the currently-open panel version */
  async function handleRevalidate() {
    if (!panelVersion) return;
    setRevalidating(true);
    try {
      const res = await fetch(`/api/timetable/v2/validate?versionId=${panelVersion.id}`);
      if (!res.ok) { setError("Re-validation failed — try again."); return; }
      const data = await res.json();
      // Update the panel and the list row with the fresh snapshot
      const fresh: VersionVulnerabilities = data.vulnerabilities;
      setPanelVersion((prev) => prev ? { ...prev, vulnerabilities: fresh } : prev);
      setVersions((prev) =>
        prev.map((v) => v.id === panelVersion.id ? { ...v, vulnerabilities: fresh } : v)
      );
    } finally {
      setRevalidating(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/timetable/v2/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          academicYear: createAY || undefined,
          term: createTerm ? Number(createTerm) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setCreateOpen(false);
      setCreateName(""); setCreateAY(""); setCreateTerm("");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(v: Version) {
    setGate({ versionId: v.id, errorCount: 0, warningCount: 0, errors: [], validated: false, validating: true });
    const valRes = await fetch(`/api/timetable/v2/validate?versionId=${v.id}`);
    if (!valRes.ok) { setGate(null); setError("Validation check failed — please try again."); return; }
    const report = await valRes.json();
    // Refresh vuln chip on this version
    if (report.vulnerabilities) {
      setVersions((prev) =>
        prev.map((x) => x.id === v.id ? { ...x, vulnerabilities: report.vulnerabilities } : x)
      );
    }
    if (report.errorCount > 0) {
      setGate({ versionId: v.id, errorCount: report.errorCount, warningCount: report.warningCount,
        errors: report.errors?.slice(0, 8) ?? [], validated: true, validating: false });
      return;
    }
    setGate(null);
    setBusy((b) => ({ ...b, [v.id]: true }));
    setError(null);
    const res  = await fetch(`/api/timetable/v2/versions/${v.id}/publish`, { method: "POST" });
    const data = await res.json();
    setBusy((b) => ({ ...b, [v.id]: false }));
    if (!res.ok) { setError(data.error || "Couldn't publish."); return; }
    load();
  }

  async function handleUnpublish(v: Version) {
    if (!confirm(`Unpublish "${v.name}"? Teachers will lose access until another version is published.`)) return;
    setBusy((b) => ({ ...b, [v.id]: true }));
    const res = await fetch(`/api/timetable/v2/versions/${v.id}/publish`, { method: "DELETE" });
    const data = await res.json();
    setBusy((b) => ({ ...b, [v.id]: false }));
    if (!res.ok) { setError(data.error); return; }
    load();
  }

  async function handleDelete(v: Version) {
    if (!confirm(`Delete "${v.name}"? This cannot be undone.`)) return;
    setBusy((b) => ({ ...b, [v.id]: true }));
    const res = await fetch(`/api/timetable/v2/versions/${v.id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy((b) => ({ ...b, [v.id]: false }));
    if (!res.ok) { setError(data.error); return; }
    if (panelVersion?.id === v.id) setPanelVersion(null);
    load();
  }

  async function handleClone() {
    if (!cloneSource || !cloneName.trim()) return;
    setCloning(true);
    const res = await fetch(`/api/timetable/v2/versions/${cloneSource.id}/clone`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloneName.trim() }),
    });
    const data = await res.json();
    setCloning(false);
    if (!res.ok) { setError(data.error); return; }
    setCloneSource(null); setCloneName("");
    load();
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    const res = await fetch(`/api/timetable/v2/versions/${renameTarget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameName.trim() }),
    });
    const data = await res.json();
    setRenaming(false);
    if (!res.ok) { setError(data.error); return; }
    setRenameTarget(null); setRenameName("");
    load();
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex gap-6 items-start">
      {/* ── Main list ─────────────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 transition-all duration-200 ${panelVersion ? "max-w-[calc(100%-22rem)]" : ""}`}>
        <ContextNavigation items={TIMETABLE_NAV} />
        <PageHeader title="Timetable" description="Manage timetable versions." />

        <div className="space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate">{versions.length} version{versions.length !== 1 ? "s" : ""}</p>
            <button onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> New version
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-20" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              message="No timetable versions yet."
              action={
                <button onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
                  <Plus className="h-4 w-4" /> Create first version
                </button>
              }
            />
          ) : (
            <div className="space-y-2" ref={menuRef}>
              {versions.map((v) => {
                const chip = vulnChip(v);
                const isSelected = panelVersion?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setPanelVersion(isSelected ? null : v)}
                    className={`bg-card border rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center
                                gap-3 cursor-pointer transition-all duration-150 select-none
                                ${isSelected
                                  ? "border-teal/50 ring-1 ring-teal/20 shadow-sm"
                                  : "border-border hover:border-teal/30 hover:shadow-sm"}`}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {v.status === "PUBLISHED" ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : v.status === "ARCHIVED" ? (
                        <Archive className="h-5 w-5 text-slate/50" />
                      ) : (
                        <FileText className="h-5 w-5 text-teal" />
                      )}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{v.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[v.status]}`}>
                          {v.status}
                        </span>
                        {v.clonedFromId && (
                          <span className="text-[10px] text-slate bg-background border border-border px-2 py-0.5 rounded-full">
                            Cloned
                          </span>
                        )}
                        {/* Vulnerability chip */}
                        {chip && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold
                                           px-2 py-0.5 rounded-full border ${chip.cls}`}>
                            <ShieldAlert className="h-2.5 w-2.5" aria-hidden />
                            {chip.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate mt-0.5">
                        {v.slotCount} lessons
                        {v.academicYear ? ` · ${v.academicYear}` : ""}
                        {v.term         ? ` Term ${v.term}`       : ""}
                        {" · "}Updated {fmt(v.updatedAt)}
                        {v.publishedAt  ? ` · Published ${fmt(v.publishedAt)}` : ""}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Health report hint */}
                      {!isSelected && v.vulnerabilities && (
                        <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate">
                          <ChevronRight className="h-3 w-3" aria-hidden />
                          View report
                        </span>
                      )}

                      {v.status === "DRAFT" && (
                        <button
                          onClick={() => handlePublish(v)}
                          disabled={busy[v.id] || gate?.versionId === v.id}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5
                                     rounded-lg bg-teal text-white hover:bg-teal-dark
                                     transition-colors disabled:opacity-50"
                        >
                          {gate?.validating && gate.versionId === v.id
                            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Validating…</>
                            : <><Upload className="h-3.5 w-3.5" />{busy[v.id] ? "Publishing…" : "Publish"}</>
                          }
                        </button>
                      )}
                      {v.status === "PUBLISHED" && (
                        <button
                          onClick={() => handleUnpublish(v)}
                          disabled={busy[v.id]}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5
                                     rounded-lg border border-border text-slate hover:border-warn
                                     hover:text-warn transition-colors disabled:opacity-50"
                        >
                          <DownloadCloud className="h-3.5 w-3.5" /> Unpublish
                        </button>
                      )}

                      {/* Kebab */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === v.id ? null : v.id)}
                          className="p-2 rounded-lg border border-border text-slate hover:text-teal
                                     hover:border-teal transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenu === v.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-card border
                                          border-border rounded-xl shadow-lg z-10 py-1">
                            {v.status !== "ARCHIVED" && (
                              <button
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                                           text-foreground hover:bg-background transition-colors"
                                onClick={() => { setRenameTarget(v); setRenameName(v.name); setOpenMenu(null); }}
                              >
                                <Pencil className="h-4 w-4 text-slate" /> Rename
                              </button>
                            )}
                            <button
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                                         text-foreground hover:bg-background transition-colors"
                              onClick={() => { setCloneSource(v); setCloneName(`${v.name} (copy)`); setOpenMenu(null); }}
                            >
                              <Copy className="h-4 w-4 text-slate" /> Clone
                            </button>
                            {v.status !== "PUBLISHED" && (
                              <button
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                                           text-danger hover:bg-danger/5 transition-colors"
                                onClick={() => { setOpenMenu(null); handleDelete(v); }}
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Vulnerabilities panel (sticky side panel) ─────────────────── */}
      {panelVersion && (
        <div className="hidden lg:block w-80 xl:w-96 shrink-0 sticky top-6">
          {panelVersion.vulnerabilities ? (
            <VersionVulnerabilitiesPanel
              versionName={panelVersion.name}
              vulnerabilities={panelVersion.vulnerabilities}
              onClose={() => setPanelVersion(null)}
              onRevalidate={handleRevalidate}
              revalidating={revalidating}
            />
          ) : (
            /* Version has no snapshot yet — offer to run validation now */
            <div className="bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{panelVersion.name}</p>
                <button onClick={() => setPanelVersion(null)}
                  className="p-1.5 rounded-lg text-slate hover:text-foreground hover:bg-background transition-colors">
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate leading-relaxed">
                No health snapshot available yet. Run a validation check to see conflicts and staffing suggestions for this version.
              </p>
              <button
                onClick={handleRevalidate}
                disabled={revalidating}
                className={primaryButtonClass + " w-full text-xs"}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${revalidating ? "animate-spin" : ""}`} />
                {revalidating ? "Checking…" : "Run health check"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Mobile: panel in a modal ─────────────────────────────────── */}
      {panelVersion && panelVersion.vulnerabilities && (
        <div className="lg:hidden">
          <Modal
            title={`Health report — ${panelVersion.name}`}
            onClose={() => setPanelVersion(null)}
            size="lg"
          >
            <VersionVulnerabilitiesPanel
              versionName={panelVersion.name}
              vulnerabilities={panelVersion.vulnerabilities}
              onClose={() => setPanelVersion(null)}
              onRevalidate={handleRevalidate}
              revalidating={revalidating}
            />
          </Modal>
        </div>
      )}

      {/* ── Create version modal ────────────────────────────────────── */}
      {createOpen && (
        <Modal title="New timetable version" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name <span className="text-danger">*</span></label>
              <input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)}
                className={inputClass} placeholder="e.g. Term 2 2026"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Academic year</label>
                <input value={createAY} onChange={(e) => setCreateAY(e.target.value)}
                  className={inputClass} placeholder="2026" />
              </div>
              <div>
                <label className={labelClass}>Term</label>
                <select value={createTerm} onChange={(e) => setCreateTerm(e.target.value)} className={inputClass}>
                  <option value="">Any</option>
                  {[1,2,3].map((t) => <option key={t} value={t}>Term {t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className={secondaryButtonClass} onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className={primaryButtonClass} onClick={handleCreate}
                disabled={creating || !createName.trim()}>
                {creating ? "Creating…" : "Create version"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Clone modal ──────────────────────────────────────────────── */}
      {cloneSource && (
        <Modal title={`Clone "${cloneSource.name}"`} onClose={() => setCloneSource(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>New version name <span className="text-danger">*</span></label>
              <input autoFocus value={cloneName} onChange={(e) => setCloneName(e.target.value)}
                className={inputClass} onKeyDown={(e) => e.key === "Enter" && handleClone()} />
            </div>
            <p className="text-xs text-slate">
              All {cloneSource.slotCount} lessons will be copied into the new version as a DRAFT.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className={secondaryButtonClass} onClick={() => setCloneSource(null)}>Cancel</button>
              <button className={primaryButtonClass} onClick={handleClone}
                disabled={cloning || !cloneName.trim()}>
                {cloning ? "Cloning…" : "Clone version"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Rename modal ─────────────────────────────────────────────── */}
      {renameTarget && (
        <Modal title="Rename version" onClose={() => setRenameTarget(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name <span className="text-danger">*</span></label>
              <input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)}
                className={inputClass} onKeyDown={(e) => e.key === "Enter" && handleRename()} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className={secondaryButtonClass} onClick={() => setRenameTarget(null)}>Cancel</button>
              <button className={primaryButtonClass} onClick={handleRename}
                disabled={renaming || !renameName.trim()}>
                {renaming ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Publish gate modal ───────────────────────────────────────── */}
      {gate?.validated && (
        <Modal title="Cannot publish — conflicts detected" onClose={() => setGate(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-danger/8
                              border border-danger/20 text-xs font-semibold text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {gate.errorCount} error{gate.errorCount !== 1 ? "s" : ""}
              </div>
              {gate.warningCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warn-bg
                                border border-warn/20 text-xs font-semibold text-warn">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {gate.warningCount} warning{gate.warningCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              This timetable has <strong>{gate.errorCount} critical conflict{gate.errorCount !== 1 ? "s" : ""}</strong> that
              must be resolved before publishing. Open the <strong>Builder</strong> to fix them.
            </p>
            {gate.errors.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {gate.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-danger/4
                                          border border-danger/15 rounded-lg">
                    <AlertCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{e.message}</p>
                      <p className="text-[10px] text-teal mt-0.5">{e.action}</p>
                    </div>
                  </div>
                ))}
                {gate.errorCount > gate.errors.length && (
                  <p className="text-xs text-slate text-center">
                    …and {gate.errorCount - gate.errors.length} more. Open the Builder to see all.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className={secondaryButtonClass} onClick={() => setGate(null)}>Dismiss</button>
              <a href="/principal/timetable/builder" className={primaryButtonClass}>
                Open Builder →
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
