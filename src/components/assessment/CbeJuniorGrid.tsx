"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALL_LEVELS,
  levelColour,
  LEVEL_LABELS,
  LEVEL_SHORT,
  type PerformanceLevel,
} from "@/lib/assessment/gradingCbe";
import {
  enqueue,
  flush,
  pendingCount,
  resetStuck,
  getStuck,
} from "@/lib/assessment/cbeOfflineQueue";
import {
  EmptyState,
  ErrorBanner,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTableRow } from "@/components/ui/ProgressivePage";

// ---------------------------------------------------------------------------
// Types (mirrors API response shapes)
// ---------------------------------------------------------------------------

type Period = { id: string; name: string; academicYear: string; term: number | null; isCurrent?: boolean };

type SubStrandOption = { id: string; name: string; sortOrder: number };
type StrandOption    = { id: string; name: string; sortOrder: number; subStrands: SubStrandOption[] };
type AreaOption      = { id: string; name: string; code: string | null; strands: StrandOption[] };

type StudentRow = {
  student:  { id: string; fullName: string; admissionNumber: string };
  level:    PerformanceLevel | null;
  comment:  string | null;
};

type RowState = {
  level:    PerformanceLevel | null;
  comment:  string | null;
  dirty:    boolean;
  saving:   boolean;
  error:    string | null;
  commentOpen: boolean;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  classes:        { id: string; name: string }[];
  defaultClassId?: string;
  lockClass?:     boolean;
  readOnly?:      boolean;
};

// ---------------------------------------------------------------------------
// Sync badge
// ---------------------------------------------------------------------------

function SyncBadge({
  pending,
  stuck,
  onRetry,
}: {
  pending: number;
  stuck:   number;
  onRetry: () => void;
}) {
  if (pending === 0 && stuck === 0) return null;

  if (stuck > 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-danger-bg border border-danger/20 text-danger text-xs px-3 py-2">
        <span>⚠ {stuck} entr{stuck === 1 ? "y" : "ies"} failed to sync.</span>
        <button
          type="button"
          onClick={onRetry}
          className="underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2">
      <span className="animate-spin inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full" />
      <span>{pending} entr{pending === 1 ? "y" : "ies"} pending sync</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation bar (inline, no browser dialog)
// ---------------------------------------------------------------------------

function ConfirmBar({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  danger = false,
}: {
  message:      string;
  onConfirm:    () => void;
  onCancel:     () => void;
  confirmLabel?: string;
  danger?:       boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-background border border-border px-3 py-2 text-sm">
      <span className="text-foreground flex-1">{message}</span>
      <button
        type="button"
        onClick={onCancel}
        className={secondaryButtonClass}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={danger
          ? "rounded-md bg-danger text-white text-sm font-medium px-3 py-1.5 hover:opacity-90"
          : primaryButtonClass}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level button
// ---------------------------------------------------------------------------

function LevelBtn({
  level,
  active,
  onClick,
  disabled,
}: {
  level:    PerformanceLevel;
  active:   boolean;
  onClick:  () => void;
  disabled: boolean;
}) {
  const { bg, text, border } = levelColour(level);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      title={LEVEL_LABELS[level]}
      className={`w-10 h-8 rounded text-xs font-semibold border transition-colors
        ${active
          ? `${bg} ${text} ${border}`
          : "bg-card text-slate border-border hover:border-slate"
        }
        disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {LEVEL_SHORT[level]}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CbeJuniorGrid({
  classes,
  defaultClassId,
  lockClass = false,
  readOnly  = false,
}: Props) {
  // ---- Selectors state ----
  const [classId,     setClassId]     = useState(defaultClassId ?? classes[0]?.id ?? "");
  const [periods,     setPeriods]     = useState<Period[]>([]);
  const [periodId,    setPeriodId]    = useState("");
  const [areas,       setAreas]       = useState<AreaOption[]>([]);
  const [areaId,      setAreaId]      = useState("");
  const [strandId,    setStrandId]    = useState("");
  const [subStrandId, setSubStrandId] = useState("");

  // ---- Data state ----
  const [rows,     setRows]     = useState<StudentRow[] | null>(null);
  const [rowState, setRowState] = useState<Map<string, RowState>>(new Map());
  const [loadErr,  setLoadErr]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // ---- Sync badge state ----
  const [syncPending, setSyncPending] = useState(0);
  const [syncStuck,   setSyncStuck]   = useState(0);

  // ---- Batch confirm state ----
  type PendingAction = { kind: "markAll"; level: PerformanceLevel } | { kind: "clearAll" };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // ---- Global save error ----
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Online/offline
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // -------------------------------------------------------------------------
  // Derived selectors
  // -------------------------------------------------------------------------

  const selectedArea   = areas.find((a) => a.id === areaId);
  const strands        = selectedArea?.strands ?? [];
  const selectedStrand = strands.find((s) => s.id === strandId);
  const subStrands     = selectedStrand?.subStrands ?? [];

  // -------------------------------------------------------------------------
  // Sync badge refresh
  // -------------------------------------------------------------------------

  const refreshSyncBadge = useCallback(async () => {
    const [pc, stuck] = await Promise.all([pendingCount(), getStuck()]);
    setSyncPending(pc);
    setSyncStuck(stuck.length);
  }, []);

  const doFlush = useCallback(async () => {
    await flush();
    await refreshSyncBadge();
  }, [refreshSyncBadge]);

  // Retry stuck entries
  const handleRetry = useCallback(async () => {
    const stuck = await getStuck();
    for (const e of stuck) await resetStuck(e.id);
    await doFlush();
  }, [doFlush]);

  // -------------------------------------------------------------------------
  // Online/offline listeners
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  doFlush(); };
    const onOffline = () => { setIsOnline(false); };
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    refreshSyncBadge();
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [doFlush, refreshSyncBadge]);

  // -------------------------------------------------------------------------
  // Load periods on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/assessments/periods")
      .then((r) => r.json())
      .then((json) => {
        if (json.periods?.length) {
          setPeriods(json.periods);
          const cur = json.periods.find((p: Period) => p.isCurrent) ?? json.periods[0];
          setPeriodId(cur.id);
        }
      })
      .catch(() => {/* silently ignore */});
  }, []);

  // -------------------------------------------------------------------------
  // Load learning areas on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/assessments/cbe/learning-areas")
      .then((r) => r.json())
      .then((json) => {
        if (json.learningAreas?.length) {
          setAreas(json.learningAreas);
          const first = json.learningAreas[0];
          setAreaId(first.id);
          const firstStrand = first.strands?.[0];
          if (firstStrand) {
            setStrandId(firstStrand.id);
            const firstSub = firstStrand.subStrands?.[0];
            if (firstSub) setSubStrandId(firstSub.id);
          }
        }
      })
      .catch(() => {/* silently ignore */});
  }, []);

  // -------------------------------------------------------------------------
  // Load substrand-sheet whenever selectors are complete
  // -------------------------------------------------------------------------

  const loadSheet = useCallback(async () => {
    if (!periodId || !classId || !subStrandId) return;
    setLoading(true);
    setLoadErr(null);
    setRows(null);
    setRowState(new Map());
    setSaveErr(null);

    try {
      const res  = await fetch(
        `/api/assessments/cbe/substrand-sheet?periodId=${periodId}&classId=${classId}&subStrandId=${subStrandId}`
      );
      const json = await res.json();
      if (!res.ok) { setLoadErr(json.error ?? "Couldn't load sheet."); return; }

      setRows(json.rows);
      const map = new Map<string, RowState>();
      for (const row of json.rows as StudentRow[]) {
        map.set(row.student.id, {
          level:       row.level,
          comment:     row.comment,
          dirty:       false,
          saving:      false,
          error:       null,
          commentOpen: false,
        });
      }
      setRowState(map);
    } catch {
      setLoadErr("Couldn't load sheet.");
    } finally {
      setLoading(false);
    }
  }, [periodId, classId, subStrandId]);

  useEffect(() => { loadSheet(); }, [loadSheet]);

  // -------------------------------------------------------------------------
  // Write helpers
  // -------------------------------------------------------------------------

  function setStudentState(studentId: string, patch: Partial<RowState>) {
    setRowState((prev) => {
      const next = new Map(prev);
      const cur  = next.get(studentId);
      if (cur) next.set(studentId, { ...cur, ...patch });
      return next;
    });
  }

  async function writeEntry(
    studentId:    string,
    level:        PerformanceLevel | null,
    comment?:     string | null,
    skipOptimistic?: boolean
  ) {
    if (!periodId || !subStrandId) return;

    if (!skipOptimistic) {
      setStudentState(studentId, { level, dirty: true, saving: true, error: null });
    }

    // Always enqueue first — ensures offline durability.
    await enqueue({
      subStrandId,
      periodId,
      studentId,
      level,
      comment: comment ?? rowState.get(studentId)?.comment ?? null,
    });

    await refreshSyncBadge();

    if (isOnline) {
      try {
        const res = await fetch("/api/assessments/cbe/item", {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            periodId,
            studentId,
            subStrandId,
            level,
            comment: comment ?? rowState.get(studentId)?.comment ?? null,
          }),
        });
        if (res.ok) {
          setStudentState(studentId, { level, dirty: false, saving: false, error: null });
          // Remove the queue entry on success (flush handles bulk; single-item success needs manual cleanup).
          // Re-flush to clear any remaining queue entries.
          await flush();
          await refreshSyncBadge();
        } else {
          const json = await res.json().catch(() => ({}));
          setStudentState(studentId, {
            saving: false,
            error:  json.error ?? "Save failed.",
          });
        }
      } catch {
        setStudentState(studentId, { saving: false, error: "Network error." });
      }
    } else {
      // Offline — optimistic update stays, badge shows pending.
      setStudentState(studentId, { saving: false, dirty: true });
    }
  }

  async function handleLevelTap(studentId: string, level: PerformanceLevel) {
    if (readOnly) return;
    const current = rowState.get(studentId);
    // Tapping the active level clears (Not_Yet_Entered).
    const newLevel = current?.level === level ? null : level;
    await writeEntry(studentId, newLevel);
  }

  async function handleCommentSave(studentId: string, comment: string) {
    if (readOnly) return;
    const currentLevel = rowState.get(studentId)?.level ?? null;
    setStudentState(studentId, { comment, dirty: true });
    await writeEntry(studentId, currentLevel, comment);
  }

  // -------------------------------------------------------------------------
  // Batch actions
  // -------------------------------------------------------------------------

  async function executeBatch(level: PerformanceLevel | null) {
    if (!rows || !periodId || !subStrandId) return;
    setSaveErr(null);

    const items = rows.map((r) => ({
      periodId,
      studentId: r.student.id,
      level,
      comment:   null as string | null,
    }));

    // Optimistic update.
    setRowState((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        const cur = next.get(r.student.id);
        if (cur) next.set(r.student.id, { ...cur, level, saving: true, dirty: true, error: null });
      }
      return next;
    });

    // Enqueue all.
    for (const item of items) {
      await enqueue({ subStrandId, periodId, studentId: item.studentId, level, comment: null });
    }
    await refreshSyncBadge();

    if (isOnline) {
      try {
        const res = await fetch("/api/assessments/cbe/batch", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ subStrandId, items }),
        });
        const json = await res.json();
        if (res.ok) {
          setRowState((prev) => {
            const next = new Map(prev);
            for (const r of rows) {
              const cur = next.get(r.student.id);
              if (cur) next.set(r.student.id, { ...cur, level, saving: false, dirty: false, error: null });
            }
            return next;
          });
          await flush();
          await refreshSyncBadge();
        } else {
          setSaveErr(json.error ?? "Batch save failed.");
          setRowState((prev) => {
            const next = new Map(prev);
            for (const r of rows) {
              const cur = next.get(r.student.id);
              if (cur) next.set(r.student.id, { ...cur, saving: false });
            }
            return next;
          });
        }
      } catch {
        setSaveErr("Network error during batch save.");
      }
    } else {
      setRowState((prev) => {
        const next = new Map(prev);
        for (const r of rows) {
          const cur = next.get(r.student.id);
          if (cur) next.set(r.student.id, { ...cur, saving: false });
        }
        return next;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Footer counts
  // -------------------------------------------------------------------------

  const counts = { EE: 0, ME: 0, AE: 0, BE: 0, NYE: 0 };
  for (const [, s] of rowState) {
    if (s.level) counts[s.level]++;
    else         counts.NYE++;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const selectors = (
    <div className="flex flex-wrap items-end gap-4 mb-5">
      {periods.length > 0 && (
        <div>
          <label className={labelClass}>Period</label>
          <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.academicYear}</option>
            ))}
          </select>
        </div>
      )}

      {!lockClass && classes.length > 1 && (
        <div>
          <label className={labelClass}>Class</label>
          <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {areas.length > 0 && (
        <div>
          <label className={labelClass}>Learning area</label>
          <select
            className={inputClass}
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              const a = areas.find((x) => x.id === e.target.value);
              const fs = a?.strands[0];
              setStrandId(fs?.id ?? "");
              setSubStrandId(fs?.subStrands[0]?.id ?? "");
            }}
          >
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      {strands.length > 0 && (
        <div>
          <label className={labelClass}>Strand</label>
          <select
            className={inputClass}
            value={strandId}
            onChange={(e) => {
              setStrandId(e.target.value);
              const s = strands.find((x) => x.id === e.target.value);
              setSubStrandId(s?.subStrands[0]?.id ?? "");
            }}
          >
            {strands.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {subStrands.length > 0 && (
        <div>
          <label className={labelClass}>Sub-strand</label>
          <select className={inputClass} value={subStrandId} onChange={(e) => setSubStrandId(e.target.value)}>
            {subStrands.map((ss) => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  const isBusy = loading || !periodId || !classId || !subStrandId;

  return (
    <div>
      {selectors}

      {/* Sync badge */}
      <div className="mb-3">
        <SyncBadge pending={syncPending} stuck={syncStuck} onRetry={handleRetry} />
      </div>

      {loadErr && <ErrorBanner message={loadErr} />}
      {saveErr && <ErrorBanner message={saveErr} />}

      {loading && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm" aria-busy="true" aria-label="Loading…">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} cols={5} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Batch confirm overlay */}
      {pendingAction && rows && rows.length > 0 && (
        <div className="mb-4">
          <ConfirmBar
            message={
              pendingAction.kind === "clearAll"
                ? `Clear all entries for all ${rows.length} students in this sub-strand?`
                : `Mark all ${rows.length} students as ${pendingAction.level}?`
            }
            confirmLabel={pendingAction.kind === "clearAll" ? "Clear all" : `Mark all ${pendingAction.level}`}
            danger={pendingAction.kind === "clearAll"}
            onCancel={() => setPendingAction(null)}
            onConfirm={async () => {
              const action = pendingAction;
              setPendingAction(null);
              if (action.kind === "clearAll") await executeBatch(null);
              else await executeBatch(action.level);
            }}
          />
        </div>
      )}

      {/* Batch bar */}
      {!readOnly && rows && rows.length > 0 && !pendingAction && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-background rounded-lg border border-border">
          <span className="text-xs text-slate mr-1">Mark all as:</span>
          {ALL_LEVELS.map((l) => {
            const { bg, text, border } = levelColour(l);
            return (
              <button
                key={l}
                type="button"
                disabled={isBusy}
                onClick={() => setPendingAction({ kind: "markAll", level: l })}
                className={`rounded px-2.5 py-1 text-xs font-semibold border ${bg} ${text} ${border} hover:opacity-80 disabled:opacity-40`}
              >
                {LEVEL_SHORT[l]}
              </button>
            );
          })}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setPendingAction({ kind: "clearAll" })}
            className="ml-auto rounded px-2.5 py-1 text-xs font-medium border border-border text-slate hover:bg-card disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <EmptyState message="No students in this class yet." />
      )}

      {!loading && rows && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-xs text-slate text-left">
                  <th className="px-3 py-2 font-medium w-28">Adm. No.</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  {ALL_LEVELS.map((l) => (
                    <th key={l} className="px-2 py-2 font-medium text-center w-12" title={LEVEL_LABELS[l]}>{l}</th>
                  ))}
                  {!readOnly && <th className="px-2 py-2 w-8" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const st = rowState.get(row.student.id);
                  if (!st) return null;
                  return (
                    <tr
                      key={row.student.id}
                      className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-background/40"} ${st.error ? "bg-danger-bg/20" : ""}`}
                    >
                      <td className="px-3 py-2 text-slate tabular-nums">{row.student.admissionNumber}</td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {row.student.fullName}
                        {st.error && (
                          <span className="ml-2 text-xs text-danger" title={st.error}>⚠</span>
                        )}
                        {st.saving && (
                          <span className="ml-2 inline-block w-3 h-3 rounded-full border-2 border-royal border-t-transparent animate-spin" />
                        )}
                      </td>
                      {ALL_LEVELS.map((l) => (
                        <td key={l} className="px-2 py-2 text-center">
                          <LevelBtn
                            level={l}
                            active={st.level === l}
                            disabled={readOnly || st.saving}
                            onClick={() => handleLevelTap(row.student.id, l)}
                          />
                        </td>
                      ))}
                      {!readOnly && (
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            title={st.comment ? "Edit comment" : "Add comment"}
                            onClick={() => setStudentState(row.student.id, { commentOpen: !st.commentOpen })}
                            className={`text-base leading-none ${st.comment ? "text-royal" : "text-slate/40 hover:text-slate"}`}
                          >
                            {st.comment ? "💬" : "+"}
                          </button>
                          {st.commentOpen && (
                            <div className="mt-1">
                              <input
                                autoFocus
                                type="text"
                                defaultValue={st.comment ?? ""}
                                placeholder="Add comment…"
                                className="w-40 rounded border border-border px-2 py-1 text-xs text-foreground focus:border-royal focus:outline-none"
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  handleCommentSave(row.student.id, val);
                                  setStudentState(row.student.id, { commentOpen: false });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  if (e.key === "Escape") {
                                    setStudentState(row.student.id, { commentOpen: false });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate">
            {ALL_LEVELS.map((l) => {
              const { bg, text } = levelColour(l);
              return (
                <span key={l} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${bg} ${text}`}>
                  {l}: {counts[l]}
                </span>
              );
            })}
            <span className="text-slate">NYE: {counts.NYE}</span>
            <span className="text-slate ml-auto">{rows.length} students</span>
          </div>
        </>
      )}
    </div>
  );
}
