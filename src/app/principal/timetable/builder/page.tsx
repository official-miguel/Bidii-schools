"use client";
/**
 * /principal/timetable/builder — Stage 4 + Override-Control Manual Editor
 *
 * Stage 4 features (existing):
 *  • Class view + Teacher view, drag-and-drop, click-to-edit, keyboard nav
 *  • Undo/redo, copy/paste, multi-cell selection
 *  • Instant conflict detection, ConflictPanel, Auto Fix
 *  • Diff view vs published
 *
 * Override-control additions (this stage):
 *  • isManual badge (cyan "M" chip) on every manually placed/moved slot
 *  • isLocked badge (padlock icon) on locked slots
 *  • Lock / Unlock via right-click context menu on filled cells
 *  • Locked cells resist drag-and-drop (drag ignored if isLocked)
 *  • Re-optimize button → calls /reoptimize (preview), shows
 *    ReoptimizePreviewModal with full diff, then applies on confirm
 *  • Change history panel (collapsible, loads /history)
 */

import {
  useEffect, useState, useMemo, useCallback, useRef, type DragEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen, User, RefreshCw, AlertCircle, AlertTriangle, History,
  CheckCircle2, Info, GitCompare, Keyboard, Zap,
  Undo2, Redo2, Lock, LockOpen, LayoutGrid, Search, X, ChevronDown, ChevronUp,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  inputClass, labelClass,
  ErrorBanner, EmptyState,
} from "@/components/ui";
import { computePeriodTimes, type PeriodTime } from "@/lib/scheduleTimes";
import ConflictPanel         from "@/components/timetable/ConflictPanel";
import SlotEditModal, { type TeacherOption } from "@/components/timetable/SlotEditModal";
import ReoptimizePreviewModal, {
  type SlotDiff, type ReoptimizeDiffStats,
} from "@/components/timetable/ReoptimizePreviewModal";
import {
  detectLiveConflicts, classKey, teacherKey,
  type LiveSlot, type ConflictEngineConfig, type ConflictSummary, type CellConflict,
} from "@/lib/timetable/liveConflictDetector";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";

// ── Constants ──────────────────────────────────────────────────────────────
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const COLORS = [
  ["bg-teal-50",   "border-teal-200",   "text-teal-800"   ],
  ["bg-blue-50",   "border-blue-200",   "text-blue-800"   ],
  ["bg-purple-50", "border-purple-200", "text-purple-800" ],
  ["bg-emerald-50","border-emerald-200","text-emerald-800"],
  ["bg-amber-50",  "border-amber-200",  "text-amber-800"  ],
  ["bg-rose-50",   "border-rose-200",   "text-rose-800"   ],
  ["bg-cyan-50",   "border-cyan-200",   "text-cyan-800"   ],
  ["bg-orange-50", "border-orange-200", "text-orange-800" ],
  ["bg-lime-50",   "border-lime-200",   "text-lime-800"   ],
  ["bg-indigo-50", "border-indigo-200", "text-indigo-800" ],
];
const CONFLICT_CELL = "bg-danger/10 border-danger text-danger";
const WARN_CELL     = "bg-warn-bg border-warn text-warn";

// ── Types ──────────────────────────────────────────────────────────────────
type Version      = { id: string; name: string; status: string; slotCount: number };
type SchoolClass  = { id: string; name: string; form: number };
type Subject      = { 
  id: string; 
  name: string; 
  code: string; 
  isGroup?: boolean; 
  groupId?: string; 
  applicableForms?: number[];
};
type Teacher      = { id: string; fullName: string; teacherSubjects: { subject: { id: string } }[] };
type TimetableCfg = {
  periodsPerDay: number; dayStartTime: string; periodDurationMinutes: number;
  breakAfterPeriod: number | null; breakDurationMinutes: number;
  lunchAfterPeriod: number | null; lunchDurationMinutes: number;
};
type TemplateColumn = { position: number; startTime: string; endTime: string; slotType: string; label: string | null; session: string };
type SpecialPeriod = { type: string; label: string; dayOfWeek: number | null; period: number };

// Undo/redo entry
type UndoEntry = { slots: LiveSlot[]; label: string };

// ── Helpers ────────────────────────────────────────────────────────────────
let colorIdx = 0;
const subjectColorCache = new Map<string, number>();
function colorFor(subjectId: string): string[] {
  if (!subjectColorCache.has(subjectId)) subjectColorCache.set(subjectId, colorIdx++ % COLORS.length);
  return COLORS[subjectColorCache.get(subjectId)!];
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BuilderPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  /** versionId passed via ?versionId= (e.g. from the generate page after creation) */
  const paramVersionId = searchParams.get("versionId");

  // ── Reference data ───────────────────────────────────────────────────────
  const [versions,   setVersions]   = useState<Version[]>([]);
  const [classes,    setClasses]    = useState<SchoolClass[]>([]);
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [teachers,   setTeachers]   = useState<Teacher[]>([]);
  const [config,        setConfig]        = useState<TimetableCfg | null>(null);
  const [lessonColumns, setLessonColumns] = useState<TemplateColumn[]>([]);
  const [allColumns,    setAllColumns]    = useState<TemplateColumn[]>([]);
  const [specials,   setSpecials]   = useState<SpecialPeriod[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([0,1,2,3,4]);
  const [maxPerDay,  setMaxPerDay]  = useState(6);
  const [unavailMap, setUnavailMap] = useState<Map<string, Set<string>>>(new Map());
  const [reqMap,     setReqMap]     = useState<Map<string, number>>(new Map());
  const [doubleSet,  setDoubleSet]  = useState<Set<string>>(new Set());

  // ── Selection state ───────────────────────────────────────────────────────
  const [mode,      setMode]      = useState<"class"|"teacher"|"school">("class");
  const [versionId, setVersionId] = useState(""); // empty until versions load
  const [classId,   setClassId]   = useState("");
  const [teacherId, setTeacherId] = useState("");

  // Derived version helpers — computed early so handlers can reference them
  const currentVersion = useMemo(
    () => versions.find((v) => v.id === versionId),
    [versions, versionId]
  );
  const isDraftVersion    = currentVersion?.status === "DRAFT";
  const isPublishedVersion = currentVersion?.status === "PUBLISHED";

  // ── School-wide view state ────────────────────────────────────────────────
  const [schoolSlots,        setSchoolSlots]        = useState<LiveSlot[]>([]);
  const [schoolLoading,      setSchoolLoading]      = useState(false);
  const [schoolSearchFilter, setSchoolSearchFilter] = useState("");

  // ── Timetable state ───────────────────────────────────────────────────────
  const [slots,   setSlots]   = useState<LiveSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Diff view: published slots for comparison
  const [diffSlots,  setDiffSlots]  = useState<LiveSlot[]>([]);
  const [showDiff,   setShowDiff]   = useState(false);

  // ── Undo/redo ─────────────────────────────────────────────────────────────
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  function pushUndo(label: string) {
    undoStack.current.push({ slots: [...slots], label });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }

  function undo() {
    const top = undoStack.current.pop();
    if (!top) return;
    redoStack.current.push({ slots: [...slots], label: top.label });
    setSlots(top.slots);
  }

  function redo() {
    const top = redoStack.current.pop();
    if (!top) return;
    undoStack.current.push({ slots: [...slots], label: top.label });
    setSlots(top.slots);
  }

  // ── Copy / paste ──────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<LiveSlot | null>(null);

  // ── Selection / focus ─────────────────────────────────────────────────────
  const [selectedCell, setSelectedCell] = useState<{ day: number; period: number } | null>(null);
  const [multiSel,     setMultiSel]     = useState<Set<string>>(new Set()); // "day-period"
  const [dragSrc,      setDragSrc]      = useState<LiveSlot | null>(null);
  /** The cell currently being dragged over — used to show swap/move indicator */
  const [dragOverCell, setDragOverCell] = useState<{ day: number; period: number; isSwap: boolean; blocked: boolean } | null>(null);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [editModal, setEditModal] = useState<{
    slot: LiveSlot | null; day: number; period: number;
  } | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError,  setModalError]  = useState<string | null>(null);

  // ── Conflict engine ───────────────────────────────────────────────────────
  const [conflictSummary, setConflictSummary] = useState<ConflictSummary>({
    totalErrors: 0, totalWarnings: 0,
    conflictMap: new Map(), conflictList: [],
  });
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [autoFixing,        setAutoFixing]        = useState(false);

  // ── Reoptimize preview ────────────────────────────────────────────────────
  const [reoptPreview,  setReoptPreview]  = useState<{ diff: SlotDiff[]; stats: ReoptimizeDiffStats } | null>(null);
  const [reoptimizing,  setReoptimizing]  = useState(false);
  const [reoptApplying, setReoptApplying] = useState(false);

  // ── Lock context menu ─────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ slot: LiveSlot; x: number; y: number } | null>(null);
  const [locking,     setLocking]     = useState(false);

  // ── History panel ─────────────────────────────────────────────────────────
  const [showHistory,    setShowHistory]    = useState(false);
  const [historyRows,    setHistoryRows]    = useState<Array<{
    id: string; actionLabel: string; changeSource: string | null;
    reason: string | null; performedAt: string;
    performer: { email: string; role: string } | null;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Help ──────────────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false);

  // ── Cell refs for scroll-to ───────────────────────────────────────────────
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  useEffect(() => {
    Promise.all([
      fetch("/api/timetable/v2/versions").then((r) => r.json()).catch(e => { console.error("Error fetching versions:", e); return []; }),
      fetch("/api/classes").then((r) => r.json()).catch(e => { console.error("Error fetching classes:", e); return []; }),
      fetch("/api/subjects").then((r) => r.json()).catch(e => { console.error("Error fetching subjects:", e); return []; }),
      fetch("/api/staff").then((r) => r.json()).catch(e => { console.error("Error fetching staff:", e); return []; }),
      fetch("/api/timetable/template").then((r) => r.json()).catch(e => { console.error("Error fetching template:", e); return {}; }),
      fetch("/api/timetable/unavailability").then((r) => r.json()).catch(e => { console.error("Error fetching unavailability:", e); return []; }),
    ]).then(([vs, cls, sub, tch, tpl, unav]) => {
      const vList: Version[] = vs ?? [];
      setVersions(vList);
      const classList: SchoolClass[] = cls?.classes ?? cls ?? [];
      setClasses(classList);
      const subList: Subject[] = sub?.subjects ?? sub ?? [];
      setSubjects(subList);
      const tchList: Teacher[] = tch?.teachers ?? tch ?? [];
      setTeachers(tchList);

      // Derive config from template columns
      if (tpl?.config) {
        const cols: TemplateColumn[] = tpl.config.columns ?? [];
        const sorted = [...cols].sort((a, b) => a.position - b.position);
        const lessonCols = sorted.filter((c) => c.slotType === "LESSON");
        // Store both full template and lesson-only columns
        setAllColumns(sorted);
        setLessonColumns(lessonCols);
        // Build a TimetableCfg-compatible object for computePeriodTimes
        const firstLesson = lessonCols[0];
        const syntheticCfg: TimetableCfg = {
          periodsPerDay:         lessonCols.length,
          dayStartTime:          firstLesson?.startTime ?? "08:00",
          periodDurationMinutes: lessonCols.length > 0
            ? Math.round(
                lessonCols.reduce((sum, c) => {
                  const [sh, sm] = c.startTime.split(":").map(Number);
                  const [eh, em] = c.endTime.split(":").map(Number);
                  return sum + ((eh * 60 + em) - (sh * 60 + sm));
                }, 0) / lessonCols.length
              )
            : 40,
          breakAfterPeriod:      null,
          breakDurationMinutes:  15,
          lunchAfterPeriod:      null,
          lunchDurationMinutes:  45,
        };
        setConfig(syntheticCfg);
        setMaxPerDay(tpl.config.maxLessonsPerTeacherPerDay ?? 6);
        // Operating days come from the template config
        const opDays: number[] = tpl.config.operatingDays ?? [0, 1, 2, 3, 4];
        if (opDays.length) setActiveDays(opDays);
      }

      // Special periods (still from v2/config for backward compat)
      fetch("/api/timetable/v2/config").then((r) => r.json()).then((cfg) => {
        if (cfg?.specialPeriods) setSpecials(cfg.specialPeriods);
      }).catch(() => {});

      // Build unavailability map
      const um = new Map<string, Set<string>>();
      for (const t of (Array.isArray(unav) ? unav : [])) {
        const set = new Set<string>((t.unavailability ?? []).map((u: {dayOfWeek:number;period:number}) => `${u.dayOfWeek}-${u.period}`));
        um.set(t.id, set);
      }
      setUnavailMap(um);

      const pub = vList.find((v) => v.status === "PUBLISHED");
      // Priority: URL ?versionId param → published → most recent draft
      if (paramVersionId && vList.some((v) => v.id === paramVersionId)) {
        setVersionId(paramVersionId);
      } else if (pub) {
        setVersionId(pub.id);
      } else {
        // No published version — open the most recent draft automatically
        const latestDraft = vList.find((v) => v.status === "DRAFT");
        if (latestDraft) setVersionId(latestDraft.id);
      }
    }).catch((error) => {
      console.error("Error in main data loading:", error);
      // Set some sensible defaults to prevent the app from crashing
      setVersions([]);
      setClasses([]);
      setSubjects([]);
      setTeachers([]);
    });
  }, [paramVersionId]);

  // ── Load slots ────────────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    try {
      if (mode === "class" && !classId) return;
      if (mode === "teacher" && !teacherId) return;
      if (mode === "school") return; // school view has its own loader
      if (!versionId) return;
      
      setLoading(true); 
      setError(null);
      
      let url = "";
      const ver = versions.find((v) => v.id === versionId);
      if (mode === "class" && ver?.status !== "PUBLISHED") {
        url = `/api/timetable/v2/versions/${versionId}/slots?classId=${classId}`;
      } else if (mode === "class") {
        // Published version — use the versioned slots endpoint directly
        url = `/api/timetable/v2/versions/${versionId}/slots?classId=${classId}`;
      } else {
        const vp = ver?.status !== "PUBLISHED" ? `&versionId=${versionId}` : "";
        url = `/api/timetable/v2/teacher-view?teacherId=${teacherId}${vp}`;
      }
      
      const res  = await fetch(url);
      if (!res.ok) throw new Error("Failed to load timetable.");
      const data = await res.json();
      const raw  = (Array.isArray(data) ? data : (data.slots ?? [])) as LiveSlot[];
      setSlots(raw.map((s) => ({
        ...s,
        isManual: s.isManual ?? false,
        isLocked: s.isLocked ?? false,
      })));

      // Load published diff when viewing a draft (class mode only)
      if (ver?.status === "DRAFT" && mode === "class") {
        const pub = versions.find((v) => v.status === "PUBLISHED");
        if (pub) {
          const dRes = await fetch(`/api/timetable/v2/versions/${pub.id}/slots?classId=${classId}`);
          if (dRes.ok) setDiffSlots(await dRes.json());
        }
      } else {
        setDiffSlots([]);
      }
    } catch (e) {
      console.error("loadSlots error:", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, classId, teacherId, versionId, versions]);

  useEffect(() => { 
    if (loadSlots) {
      loadSlots().catch(error => {
        console.error("Error in loadSlots:", error);
        setError("Failed to load timetable data");
      });
    }
  }, [loadSlots]);

  // ── Load ALL slots for school-wide view ───────────────────────────────────
  const loadSchoolSlots = useCallback(async () => {
    if (!versionId) return;
    setSchoolLoading(true);
    try {
      const url = `/api/timetable/v2/versions/${versionId}/slots`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error("Failed to load school timetable.");
      const data = await res.json();
      const raw  = (Array.isArray(data) ? data : (data.slots ?? [])) as LiveSlot[];
      setSchoolSlots(raw.map((s) => ({
        ...s,
        isManual: s.isManual ?? false,
        isLocked: s.isLocked ?? false,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSchoolLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    if (mode === "school") loadSchoolSlots();
  }, [mode, loadSchoolSlots]);

  // ── Load requirements for conflict engine ─────────────────────────────────
  useEffect(() => {
    if (!classId || !classes.length || !subjects.length) return;
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    const rm  = new Map<string, number>();
    const ds  = new Set<string>();
    for (const s of subjects) {
      rm.set(`${classId}-${s.id}`, (s as unknown as {lessonsPerWeek?: number}).lessonsPerWeek ?? 0);
    }
    setReqMap(rm);
    setDoubleSet(ds);
  }, [classId, classes, subjects]);

  // ── Run conflict engine on every slot change ──────────────────────────────
  const conflictCfg = useMemo<ConflictEngineConfig>(() => {
    const blocked = new Set<string>();
    for (const sp of specials) {
      if (sp.dayOfWeek !== null) blocked.add(`${sp.dayOfWeek}-${sp.period}`);
      else activeDays.forEach((d) => blocked.add(`${d}-${sp.period}`));
    }
    // Build classId → form map so the conflict engine can distinguish
    // elective-group fan-out (same subject, same form, multiple streams)
    // from genuine cross-form double-booking.
    const classFormMap = new Map<string, number>(
      classes.map((c) => [c.id, c.form])
    );
    return {
      operatingDays:              activeDays,
      periodsPerDay:              config?.periodsPerDay ?? 8,
      blockedSlots:               blocked,
      maxLessonsPerTeacherPerDay: maxPerDay,
      teacherUnavailability:      unavailMap,
      requiredLessons:            reqMap,
      doubleSubjects:             doubleSet,
      classFormMap,
    };
  }, [specials, activeDays, config, maxPerDay, unavailMap, reqMap, doubleSet, classes]);

  useEffect(() => {
    if (!slots.length) {
      setConflictSummary({ totalErrors: 0, totalWarnings: 0, conflictMap: new Map(), conflictList: [] });
      return;
    }
    const s = detectLiveConflicts(slots, conflictCfg);
    setConflictSummary(s);
    if (s.totalErrors > 0 && !showConflictPanel) setShowConflictPanel(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, conflictCfg]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const periodTimes = useMemo<Map<number, PeriodTime>>(() => {
    // Use actual startTime/endTime from the saved template columns so the
    // period labels respect breaks and lunch gaps.
    if (lessonColumns.length > 0) {
      function parseMinutes(t: string): number {
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      }
      return new Map(
        lessonColumns.map((col, i) => {
          const startMinutes = parseMinutes(col.startTime);
          const endMinutes   = parseMinutes(col.endTime);
          return [
            i + 1,
            {
              period:       i + 1,
              startMinutes,
              endMinutes,
              label:        `${col.startTime}–${col.endTime}`,
            } satisfies PeriodTime,
          ];
        })
      );
    }
    // Fallback to computed times if template hasn't loaded yet
    if (!config) return new Map();
    return new Map(computePeriodTimes(config).map((t) => [t.period, t]));
  }, [lessonColumns, config]);

  const slotMap = useMemo(() => {
    const m = new Map<string, LiveSlot>();
    slots.forEach((s) => {
      const key = `${s.dayOfWeek}-${s.period}`;
      const existing = m.get(key);
      // When multiple slots share the same period (elective group fan-out), the
      // group anchor carries isGroupAnchor=true and should be the representative
      // displayed in the cell.  Only overwrite if the incoming slot is the anchor
      // or if there is nothing there yet.
      if (!existing || s.isGroupAnchor) {
        m.set(key, s);
      }
    });
    return m;
  }, [slots]);

  const diffMap = useMemo(() => {
    const m = new Map<string, LiveSlot>();
    diffSlots.forEach((s) => {
      const key = `${s.dayOfWeek}-${s.period}`;
      const existing = m.get(key);
      if (!existing || s.isGroupAnchor) m.set(key, s);
    });
    return m;
  }, [diffSlots]);

  const isSpecial = useCallback((day: number, p: number) =>
    specials.some((sp) => sp.period === p && (sp.dayOfWeek === null || sp.dayOfWeek === day)),
    [specials]
  );

  const specialLabel = useCallback((day: number, p: number) => {
    const sp = specials.find((s) => s.period === p && (s.dayOfWeek === null || s.dayOfWeek === day));
    return sp?.label ?? "";
  }, [specials]);

  // Conflict key for a cell
  const getCellConflicts = useCallback((day: number, p: number) => {
    const ck = mode === "class"
      ? classKey(classId,   day, p)
      : teacherKey(teacherId, day, p);
    return conflictSummary.conflictMap.get(ck) ?? [];
  }, [conflictSummary, mode, classId, teacherId]);

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function onDragStart(e: DragEvent<HTMLButtonElement>, slot: LiveSlot) {
    if (slot.isLocked) { e.preventDefault(); return; }
    setDragSrc(slot);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDragSrc(null);
    setDragOverCell(null);
  }

  /**
   * Checks whether swapping dragSrc into (day, period) — which is already
   * occupied by `targetSlot` — would cause a teacher clash for either side.
   * Returns null if clean, or an error message string if blocked.
   */
  function checkSwapClash(targetSlot: LiveSlot, day: number, period: number): string | null {
    if (!dragSrc) return "No drag source.";

    // Simulate the swap: each slot takes the other's position
    const proposed = slots.map((s) => {
      if (s.id === dragSrc.id)    return { ...s, dayOfWeek: day,             period };
      if (s.id === targetSlot.id) return { ...s, dayOfWeek: dragSrc.dayOfWeek, period: dragSrc.period };
      return s;
    });
    const check    = detectLiveConflicts(proposed, conflictCfg);
    const ckDragSrc = classKey(dragSrc.classId,    day,             period);
    const ckTarget  = classKey(targetSlot.classId, dragSrc.dayOfWeek, dragSrc.period);

    const clashesA = (check.conflictMap.get(ckDragSrc) ?? []).filter((c) => c.severity === "error");
    const clashesB = (check.conflictMap.get(ckTarget)  ?? []).filter((c) => c.severity === "error");
    const first    = clashesA[0] ?? clashesB[0];
    return first ? first.message : null;
  }

  async function onDrop(e: DragEvent<HTMLTableCellElement>, day: number, period: number) {
    e.preventDefault();
    setDragOverCell(null);
    if (!dragSrc || dragSrc.isLocked || !versionId || !isDraftVersion) { setDragSrc(null); return; }
    if (dragSrc.dayOfWeek === day && dragSrc.period === period) { setDragSrc(null); return; }

    const targetSlot = slotMap.get(`${day}-${period}`) ?? null;

    if (targetSlot && !targetSlot.isLocked) {
      // ── Swap mode: target cell is filled ─────────────────────────────────
      const clashMsg = checkSwapClash(targetSlot, day, period);
      if (clashMsg) {
        setError(`Cannot swap: ${clashMsg}`);
        setDragSrc(null);
        return;
      }

      // Optimistic update: swap positions in local state
      pushUndo("Swap lessons");
      setSlots((prev) => prev.map((s) => {
        if (s.id === dragSrc.id)    return { ...s, dayOfWeek: day,             period,           isManual: true };
        if (s.id === targetSlot.id) return { ...s, dayOfWeek: dragSrc.dayOfWeek, period: dragSrc.period, isManual: true };
        return s;
      }));
      setDragSrc(null);

      const res = await fetch(`/api/timetable/v2/versions/${versionId}/swap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotAId: dragSrc.id, slotBId: targetSlot.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Swap failed — reverting.");
        loadSlots();
      }
    } else {
      // ── Move mode: target cell is empty ──────────────────────────────────
      const proposed = slots.map((s) =>
        s.id === dragSrc.id ? { ...s, dayOfWeek: day, period } : s
      );
      const check   = detectLiveConflicts(proposed, conflictCfg);
      const ck      = classKey(dragSrc.classId, day, period);
      const clashes = (check.conflictMap.get(ck) ?? []).filter((c) => c.severity === "error");
      if (clashes.length > 0) {
        setError(`Cannot move here: ${clashes[0].message}`);
        setDragSrc(null);
        return;
      }

      pushUndo("Move lesson");
      setSlots(proposed);
      setDragSrc(null);

      const res = await fetch(`/api/timetable/v2/versions/${versionId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: dragSrc.id, dayOfWeek: day, period }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Move failed — reverting.");
        loadSlots();
      }
    }
  }

  function onDragOver(e: DragEvent<HTMLTableCellElement>, day: number, period: number) {
    if (!dragSrc) return;

    const targetSlot = slotMap.get(`${day}-${period}`) ?? null;

    if (targetSlot && !targetSlot.isLocked) {
      // Swap candidate — check for clashes
      const clashMsg = checkSwapClash(targetSlot, day, period);
      if (clashMsg) {
        e.dataTransfer.dropEffect = "none";
        setDragOverCell({ day, period, isSwap: true, blocked: true });
      } else {
        e.dataTransfer.dropEffect = "move";
        setDragOverCell({ day, period, isSwap: true, blocked: false });
      }
    } else {
      // Move candidate (empty cell) — check for clashes
      const proposed = slots.map((s) =>
        s.id === dragSrc.id ? { ...s, dayOfWeek: day, period } : s
      );
      const check   = detectLiveConflicts(proposed, conflictCfg);
      const ck      = classKey(dragSrc.classId, day, period);
      const clashes = (check.conflictMap.get(ck) ?? []).filter((c) => c.severity === "error");
      if (clashes.length > 0) {
        e.dataTransfer.dropEffect = "none";
        setDragOverCell({ day, period, isSwap: false, blocked: true });
      } else {
        e.dataTransfer.dropEffect = "move";
        setDragOverCell({ day, period, isSwap: false, blocked: false });
      }
    }

    e.preventDefault();
  }

  function onDragLeave(e: DragEvent<HTMLTableCellElement>) {
    // Only clear if we're leaving the cell entirely (not moving to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverCell(null);
    }
  }

  // ── Add / edit slot ───────────────────────────────────────────────────────
  async function handleSaveSlot(subjectId: string, tId: string, room: string | null) {
    if (!editModal) return;
    setModalSaving(true); setModalError(null);
    const { slot, day, period } = editModal;

    if (slot && isDraftVersion) {
      // Edit: move + potentially change teacher
      pushUndo("Edit lesson");
      const res = await fetch(`/api/timetable/v2/versions/${versionId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, dayOfWeek: day, period, teacherId: tId, room }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error); setModalSaving(false); return; }
      setSlots((prev) => prev.map((s) => s.id === slot.id
        ? { ...s, dayOfWeek: day, period, teacherId: tId,
            teacherName: teachers.find((t) => t.id === tId)?.fullName ?? s.teacherName,
            subjectId, room, isManual: true }
        : s
      ));
    } else {
      // Add new slot — only drafts are writable
      if (!isDraftVersion) { setModalSaving(false); return; }
      const res = await fetch(`/api/timetable/v2/versions/${versionId}/slots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, dayOfWeek: day, period, subjectId, teacherId: tId, room }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error); setModalSaving(false); return; }
      pushUndo("Add lesson");
      const sub = subjects.find((s) => s.id === subjectId);
      const tch = teachers.find((t) => t.id === tId);
      const newSlot: LiveSlot = {
        id: data.id ?? `tmp-${Date.now()}`,
        classId, className: classes.find((c) => c.id === classId)?.name ?? "",
        dayOfWeek: day, period, subjectId,
        subjectCode: sub?.code ?? "", teacherId: tId,
        teacherName: tch?.fullName ?? "", room, isDouble: false,
        isManual: true, isLocked: false,
      };
      setSlots((prev) => [...prev, newSlot]);
    }
    setModalSaving(false);
    setEditModal(null);
  }

  async function handleDeleteSlot(slot: LiveSlot) {
    if (!isDraftVersion) return; // published/archived are read-only
    pushUndo("Delete lesson");
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    await fetch(`/api/timetable/v2/versions/${versionId}/slots?slotId=${slot.id}`, { method: "DELETE" });
  }

  // ── Auto-fix ──────────────────────────────────────────────────────────────
  async function handleAutoFix(classIds: string[]) {
    if (!versionId || !isDraftVersion) return;
    setAutoFixing(true);
    const res  = await fetch(`/api/timetable/v2/versions/${versionId}/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: [{ type: "AUTO_FIX", classIds }] }),
    });
    setAutoFixing(false);
    if (res.ok) loadSlots();
    else { const d = await res.json(); setError(d.error ?? "Auto-fix failed."); }
  }

  // ── Conflict jump ─────────────────────────────────────────────────────────
  function jumpToConflict(key: string) {
    const el = cellRefs.current.get(key);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
  }

  // Navigate to lesson-requirements page pre-filtered to the given class
  function handleNavigateToRequirements(classId: string) {
    router.push(`/principal/timetable/requirements?classId=${encodeURIComponent(classId)}`);
  }

  // ── Lock / unlock slot ────────────────────────────────────────────────────
  async function handleToggleLock(slot: LiveSlot, scope: string = "SLOT") {
    if (!versionId || !isDraftVersion) return;
    setLocking(true);
    setContextMenu(null);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: slot.id, lock: !slot.isLocked, scope }),
    });
    setLocking(false);
    if (res.ok) {
      setSlots((prev) => prev.map((s) => {
        if (scope === "SLOT" && s.id !== slot.id) return s;
        if (scope === "SUBJECT" && (s.classId !== slot.classId || s.subjectId !== slot.subjectId)) return s;
        if (scope === "CLASS"   && s.classId !== slot.classId) return s;
        if (scope === "DAY"     && (s.classId !== slot.classId || s.dayOfWeek !== slot.dayOfWeek)) return s;
        if (scope === "TEACHER" && s.teacherId !== slot.teacherId) return s;
        return { ...s, isLocked: !slot.isLocked, lockScope: scope };
      }));
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Lock toggle failed.");
    }
  }

  // ── Re-optimize ───────────────────────────────────────────────────────────
  async function handleReoptimize() {
    if (!versionId || !isDraftVersion) return;
    setReoptimizing(true); setError(null);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/reoptimize`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setReoptimizing(false);
    if (!res.ok) { setError(data.error ?? "Re-optimize failed."); return; }
    setReoptPreview({ diff: data.diff, stats: data.stats });
  }

  async function handleApplyReoptimize() {
    if (!versionId || !reoptPreview) return;
    setReoptApplying(true);
    const res = await fetch(
      `/api/timetable/v2/versions/${versionId}/reoptimize?apply=true`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    );
    setReoptApplying(false);
    setReoptPreview(null);
    if (res.ok) loadSlots();
    else { const d = await res.json(); setError(d.error ?? "Apply failed."); }
  }

  // ── History ───────────────────────────────────────────────────────────────
  async function loadHistory() {
    if (!versionId || !isDraftVersion) return;
    setHistoryLoading(true);
    const res = await fetch(`/api/timetable/v2/versions/${versionId}/history?limit=30`);
    const data = await res.json();
    setHistoryLoading(false);
    if (res.ok) setHistoryRows(data.entries ?? []);
  }

  function toggleHistory() {
    setShowHistory((o) => {
      if (!o) loadHistory();
      return !o;
    });
  }

  // ── Teacher options for modal ─────────────────────────────────────────────
  const teacherOptions = useMemo<TeacherOption[]>(() => {
    if (!editModal) return [];
    return teachers.map((t) => {
      // isEligible uses the *modal's current* subjectId when the teacher option
      // is first built; the modal will re-check via subjectIds[] on any change.
      const isEligible  = t.teacherSubjects?.some((ts) => ts.subject.id === (editModal.slot?.subjectId ?? ""));
      const slotK       = `${editModal.day}-${editModal.period}`;
      const isBusy      = slots.some((s) => s.teacherId === t.id && s.dayOfWeek === editModal.day && s.period === editModal.period && s.id !== editModal.slot?.id);
      const isUnavail   = unavailMap.get(t.id)?.has(slotK) ?? false;
      // Pass the full list of subject IDs so the modal can re-filter eligibility
      // whenever the user changes the subject dropdown.
      const subjectIds  = (t.teacherSubjects ?? []).map((ts) => ts.subject.id);
      return { id: t.id, fullName: t.fullName, isEligible, isBusy, isUnavailable: isUnavail, subjectIds };
    });
  }, [editModal, teachers, slots, unavailMap]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "z") { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === "c" && selectedCell) {
        const s = slotMap.get(`${selectedCell.day}-${selectedCell.period}`);
        if (s) { setClipboard(s); return; }
      }
      if (ctrl && e.key === "v" && clipboard && selectedCell) {
        e.preventDefault();
        const sub = subjects.find((s) => s.id === clipboard.subjectId);
        const tch = teachers.find((t) => t.id === clipboard.teacherId);
        if (sub && tch) setEditModal({
          slot: null, day: selectedCell.day, period: selectedCell.period,
        });
        return;
      }
      if (e.key === "?" && !e.ctrlKey) { setShowHelp((o) => !o); return; }
      if (e.key === "Escape") { setSelectedCell(null); setMultiSel(new Set()); setEditModal(null); return; }
      if (e.key === "Delete" && selectedCell) {
        const s = slotMap.get(`${selectedCell.day}-${selectedCell.period}`);
        if (s) handleDeleteSlot(s);
        return;
      }

      // Arrow navigation
      if (!selectedCell) return;
      const days = activeDays;
      const dIdx = days.indexOf(selectedCell.day);
      if (e.key === "ArrowRight" && dIdx < days.length - 1) { e.preventDefault(); setSelectedCell({ day: days[dIdx + 1], period: selectedCell.period }); }
      if (e.key === "ArrowLeft"  && dIdx > 0)               { e.preventDefault(); setSelectedCell({ day: days[dIdx - 1], period: selectedCell.period }); }
      if (e.key === "ArrowDown"  && selectedCell.period < (config?.periodsPerDay ?? 8)) { e.preventDefault(); setSelectedCell({ day: selectedCell.day, period: selectedCell.period + 1 }); }
      if (e.key === "ArrowUp"    && selectedCell.period > 1)  { e.preventDefault(); setSelectedCell({ day: selectedCell.day, period: selectedCell.period - 1 }); }
      if (e.key === "Enter") { setEditModal({ slot: slotMap.get(`${selectedCell.day}-${selectedCell.period}`) ?? null, day: selectedCell.day, period: selectedCell.period }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCell, slotMap, clipboard, activeDays, config]);

  // ── Derived ─ version metadata (aliased for JSX readability) ─────────────
  const isDraft     = isDraftVersion;
  const isPublished = isPublishedVersion;
  const drafts      = versions.filter((v) => v.status === "DRAFT");

  return (
    <div className="relative">
      <ContextNavigation items={TIMETABLE_NAV} />

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight">Timetable Editor</h1>
          <p className="text-slate text-sm mt-1">Drag-and-drop, click to edit, keyboard navigation.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Conflict badge */}
          <button
            onClick={() => setShowConflictPanel((o) => !o)}
            aria-label={`${conflictSummary.totalErrors} conflicts`}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors
              ${conflictSummary.totalErrors > 0
                ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/15"
                : conflictSummary.totalWarnings > 0
                  ? "bg-warn-bg border-warn/30 text-warn hover:bg-warn/15"
                  : "bg-success-bg border-success/20 text-success"
              }`}
          >
            {conflictSummary.totalErrors > 0
              ? <AlertCircle   className="h-3.5 w-3.5" aria-hidden />
              : conflictSummary.totalWarnings > 0
                ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                : <CheckCircle2  className="h-3.5 w-3.5" aria-hidden />
            }
            {conflictSummary.totalErrors > 0
              ? `${conflictSummary.totalErrors} conflict${conflictSummary.totalErrors !== 1 ? "s" : ""}`
              : conflictSummary.totalWarnings > 0
                ? `${conflictSummary.totalWarnings} warning${conflictSummary.totalWarnings !== 1 ? "s" : ""}`
                : "Clean"
            }
          </button>

          {/* Re-optimize */}
          {isDraft && mode === "class" && (
            <button
              onClick={handleReoptimize}
              disabled={reoptimizing}
              title="Re-optimize unlocked lessons"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal/40 bg-teal-50 text-teal text-xs font-semibold hover:bg-teal/10 transition-colors disabled:opacity-50"
            >
              {reoptimizing
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Zap       className="h-3.5 w-3.5" aria-hidden />
              }
              {reoptimizing ? "Analyzing…" : "Re-optimize"}
            </button>
          )}

          {/* History */}
          {isDraft && (
            <button
              onClick={toggleHistory}
              title="Change history"
              className={`p-2 rounded-lg border transition-colors ${showHistory ? "bg-teal/10 border-teal text-teal" : "border-line text-slate hover:text-teal hover:border-teal"}`}
            >
              <History className="h-4 w-4" aria-hidden /><span className="sr-only">History</span>
            </button>
          )}

          {/* Undo/Redo */}
          <button onClick={undo} disabled={!undoStack.current.length} title="Undo (Ctrl+Z)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors disabled:opacity-30">
            <Undo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Undo</span>
          </button>
          <button onClick={redo} disabled={!redoStack.current.length} title="Redo (Ctrl+Y)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors disabled:opacity-30">
            <Redo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Redo</span>
          </button>

          {/* Diff toggle */}
          {diffSlots.length > 0 && (
            <button onClick={() => setShowDiff((o) => !o)} title="Compare with published"
              className={`p-2 rounded-lg border transition-colors ${showDiff ? "bg-teal/10 border-teal text-teal" : "border-line text-slate hover:text-teal hover:border-teal"}`}>
              <GitCompare className="h-4 w-4" aria-hidden /><span className="sr-only">Diff view</span>
            </button>
          )}

          {/* Help */}
          <button onClick={() => setShowHelp((o) => !o)} title="Keyboard shortcuts (?)"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
            <Keyboard className="h-4 w-4" aria-hidden /><span className="sr-only">Shortcuts</span>
          </button>

          <button onClick={loadSlots} title="Refresh"
            className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            <span className="sr-only">Refresh</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Controls bar */}
      <div className="bg-white border border-line rounded-xl p-4 flex flex-wrap gap-3 items-end mb-4">
        {/* Mode toggle */}
        <div>
          <label className={labelClass}>View</label>
          <div className="flex rounded-lg border border-line overflow-hidden text-sm">
            {(["school","class","teacher"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSlots([]); setSelectedCell(null); setSchoolSearchFilter(""); }}
                className={`px-3 py-2 font-medium transition-colors ${mode === m ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper"}`}>
                {m === "school"
                  ? <><LayoutGrid className="h-4 w-4 inline mr-1" aria-hidden />School</>
                  : m === "class"
                    ? <><BookOpen  className="h-4 w-4 inline mr-1" aria-hidden />Class</>
                    : <><User      className="h-4 w-4 inline mr-1" aria-hidden />Teacher</>
                }
              </button>
            ))}
          </div>
        </div>

        {/* Version picker */}
        <div className="min-w-[220px]">
          <label className={labelClass}>Version</label>
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)} className={inputClass}>
            {/* Drafts first — most actionable */}
            {versions.filter((v) => v.status === "DRAFT").length > 0 && (
              <optgroup label="── Drafts (editing)">
                {versions
                  .filter((v) => v.status === "DRAFT")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.slotCount} lessons
                    </option>
                  ))}
              </optgroup>
            )}
            {/* Published */}
            {versions.filter((v) => v.status === "PUBLISHED").map((v) => (
              <optgroup key={v.id} label="── Published (live)">
                <option value={v.id}>{v.name} — {v.slotCount} lessons ✓</option>
              </optgroup>
            ))}
            {/* Archived */}
            {versions.filter((v) => v.status === "ARCHIVED").length > 0 && (
              <optgroup label="── Archived">
                {versions
                  .filter((v) => v.status === "ARCHIVED")
                  .map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
              </optgroup>
            )}
            {versions.length === 0 && (
              <option value="" disabled>No versions — generate a timetable first</option>
            )}
          </select>
        </div>

        {/* Entity selector */}
        {mode === "class" ? (
          <div className="min-w-[180px]">
            <label className={labelClass}>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
              <option value="">Select a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="min-w-[200px]">
            <label className={labelClass}>Teacher</label>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputClass}>
              <option value="">Select a teacher…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </select>
          </div>
        )}

        {/* Version status chip */}
        {isDraft && (
          <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal text-xs font-semibold">
            ✎ Editing draft
          </span>
        )}
        {isPublished && drafts.length > 0 && (
          <button
            onClick={() => setVersionId(drafts[0].id)}
            className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700
                       text-xs font-semibold hover:bg-amber-100 transition-colors"
            title={`Switch to draft: ${drafts[0].name}`}
          >
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""} available — click to edit
          </button>
        )}
        {!versionId && (
          <span className="px-2.5 py-1 rounded-full bg-paper border border-line text-slate text-xs">
            No versions yet — generate a timetable first
          </span>
        )}
      </div>

      {/* "Read-only" notice when viewing published with drafts present */}
      {isPublished && drafts.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 mb-3 rounded-xl
                        bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span className="font-semibold shrink-0">Viewing published (read-only).</span>
          <span>You have {drafts.length} unpublished draft{drafts.length !== 1 ? "s" : ""}.</span>
          <button
            onClick={() => setVersionId(drafts[0].id)}
            className="ml-auto shrink-0 font-semibold underline underline-offset-2
                       hover:text-amber-900 transition-colors"
          >
            Switch to &quot;{drafts[0].name}&quot; →
          </button>
        </div>
      )}

      {/* "No draft to edit" notice when no versions exist */}
      {!versionId && !versions.length && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 mb-3 rounded-xl
                        bg-paper border border-line text-slate text-xs">
          No timetable versions found. Go to
          <a href="/principal/timetable/generate"
            className="font-semibold text-teal underline underline-offset-2 ml-1">
            Generate
          </a>
          &nbsp;to create one, then return here to edit it.
        </div>
      )}
      <div className="flex gap-4 items-start">
        {/* Timetable grid */}
        <div className="flex-1 min-w-0">
          {mode === "school" ? (
            /* ── School-wide view ─────────────────────────────────────── */
            <SchoolTimetableView
              slots={schoolSlots}
              classes={classes}
              activeDays={activeDays}
              lessonColumns={lessonColumns}
              allColumns={allColumns}
              searchFilter={schoolSearchFilter}
              onSearchChange={setSchoolSearchFilter}
              loading={schoolLoading}
              onSelectClass={(cId) => {
                setClassId(cId);
                setMode("class");
              }}
              onRefresh={loadSchoolSlots}
            />
          ) : ((mode === "class" && !classId) || (mode === "teacher" && !teacherId)) ? (
            <EmptyState message={mode === "class" ? "Select a class to edit its timetable." : "Select a teacher to view their schedule."} />
          ) : loading ? (
            <div className="bg-white border border-line rounded-xl p-10 text-center text-slate text-sm animate-pulse">
              Loading timetable…
            </div>
          ) : (
            <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse" style={{ minWidth: "640px" }}>
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide border-b border-r border-line w-20 sticky left-0 bg-slate-50/80 z-10">
                        Period
                      </th>
                      {activeDays.map((day) => (
                        <th key={day} className="px-3 py-3 text-xs font-semibold text-slate uppercase tracking-wide border-b border-line text-left">
                          {DAYS[day]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(allColumns.length > 0 ? allColumns : lessonColumns.map((c, i) => ({ ...c, _lessonIdx: i }))).map((col, colIdx) => {
                      const isLesson = col.slotType === "LESSON";

                      // For non-lesson columns (BREAK, LUNCH, GAMES, ASSEMBLY)
                      // render a single full-width separator row
                      if (!isLesson) {
                        const nonLessonStyles: Record<string, string> = {
                          BREAK:    "bg-orange-50 text-orange-600",
                          LUNCH:    "bg-green-50 text-green-700",
                          GAMES:    "bg-pink-50 text-pink-700",
                          ASSEMBLY: "bg-slate-100 text-slate-600",
                        };
                        const style = nonLessonStyles[col.slotType] ?? "bg-slate-50 text-slate-500";
                        return (
                          <tr key={`nonlesson-${colIdx}`} aria-hidden>
                            <td
                              colSpan={activeDays.length + 1}
                              className={`px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest border-b border-line ${style}`}
                            >
                              {col.label ?? col.slotType} · {col.startTime}–{col.endTime}
                            </td>
                          </tr>
                        );
                      }

                      // Lesson row — find its 1-based period index among lesson cols only
                      const period = lessonColumns.findIndex((lc) => lc.position === col.position) + 1;
                      if (period === 0) return null; // safety

                      return (
                      <tr key={period} className="hover:bg-slate-50/20 transition-colors">
                        <td className="px-3 py-2 border-r border-b border-line sticky left-0 bg-white z-10">
                          <div className="text-xs font-semibold text-ink">{period}</div>
                          {periodTimes.get(period) && (
                            <div className="text-[10px] text-slate/60 mt-0.5">{periodTimes.get(period)!.label}</div>
                          )}
                        </td>
                        {activeDays.map((day) => {
                          const slot     = slotMap.get(`${day}-${period}`);
                          const special  = isSpecial(day, period);
                          const cellConflicts = getCellConflicts(day, period);
                          const hasError   = cellConflicts.some((c) => c.severity === "error");
                          const hasWarning = !hasError && cellConflicts.some((c) => c.severity === "warning");
                          const isSelected = selectedCell?.day === day && selectedCell?.period === period;
                          const isMulti    = multiSel.has(`${day}-${period}`);

                          const ck = mode === "class"
                            ? classKey(classId, day, period)
                            : teacherKey(teacherId, day, period);

                          // Diff: check if this slot differs from published
                          const diffSlot = showDiff ? diffMap.get(`${day}-${period}`) : undefined;
                          const isDiffChanged = showDiff && diffSlot && slot &&
                            (diffSlot.subjectId !== slot.subjectId || diffSlot.teacherId !== slot.teacherId);
                          const isDiffAdded   = showDiff && slot && !diffSlot;
                          const isDiffRemoved = showDiff && !slot && diffSlot;

                          return (
                            <td key={day}
                              className={`border-b border-line p-1 align-top transition-colors
                                ${isSelected || isMulti ? "bg-teal-50/50 ring-1 ring-inset ring-teal/30" : ""}
                                ${isDiffChanged ? "bg-amber-50/30" : ""}
                                ${isDiffAdded   ? "bg-green-50/30" : ""}
                                ${isDiffRemoved ? "bg-red-50/30"   : ""}
                                ${dragOverCell?.day === day && dragOverCell?.period === period
                                  ? dragOverCell.blocked
                                    ? "ring-2 ring-inset ring-danger/50 bg-danger/5"
                                    : dragOverCell.isSwap
                                      ? "ring-2 ring-inset ring-purple-400 bg-purple-50/40"
                                      : "ring-2 ring-inset ring-teal/60 bg-teal/5"
                                  : ""}
                              `}
                              onDragOver={mode === "class" ? (e: DragEvent<HTMLTableCellElement>) => onDragOver(e, day, period) : undefined}
                              onDragLeave={mode === "class" ? (e: DragEvent<HTMLTableCellElement>) => onDragLeave(e) : undefined}
                              onDrop={mode === "class"
                                ? (e: DragEvent<HTMLTableCellElement>) => onDrop(e, day, period)
                                : undefined
                              }
                              ref={(el) => {
                                if (el) cellRefs.current.set(ck, el);
                                else    cellRefs.current.delete(ck);
                              }}
                              onClick={() => {
                                setSelectedCell({ day, period });
                                setMultiSel(new Set());
                              }}
                            >
                              {special && !slot ? (
                                <div className="min-h-[60px] rounded-lg bg-paper border border-dashed border-line flex items-center justify-center px-1">
                                  <span className="text-[9px] text-slate/60 font-medium uppercase tracking-wide text-center">
                                    {specialLabel(day, period)}
                                  </span>
                                </div>
                              ) : slot ? (
                                <SlotCell
                                  slot={slot}
                                  mode={mode}
                                  hasError={hasError}
                                  hasWarning={hasWarning}
                                  conflicts={cellConflicts}
                                  isDraft={isDraft}
                                  onEdit={() => !slot.isLocked && setEditModal({ slot, day, period })}
                                  onDelete={() => !slot.isLocked && handleDeleteSlot(slot)}
                                  onDragStart={(e) => mode === "class" ? onDragStart(e, slot) : undefined}
                                  onDragEnd={onDragEnd}
                                  onContextMenu={(e) => {
                                    if (!isDraft) return;
                                    e.preventDefault();
                                    setContextMenu({ slot, x: e.clientX, y: e.clientY });
                                  }}
                                />
                              ) : mode === "class" ? (
                                <button
                                  aria-label={`Add lesson — ${DAYS[day]} period ${period}`}
                                  onClick={() => setEditModal({ slot: null, day, period })}
                                  className="w-full min-h-[60px] rounded-lg border-2 border-dashed
                                             border-line/60 text-slate/30 hover:border-teal hover:text-teal
                                             hover:bg-teal-50/20 flex items-center justify-center transition-all"
                                >
                                  <span className="text-lg font-light" aria-hidden>+</span>
                                </button>
                              ) : (
                                <div className="min-h-[60px] rounded-lg bg-slate-50/40 border border-dashed border-line/30" />
                              )}

                              {/* Diff removed indicator */}
                              {isDiffRemoved && (
                                <div className="mt-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1 opacity-60">
                                  <p className="text-[10px] font-semibold text-red-700 line-through">{diffSlot!.subjectCode}</p>
                                  <p className="text-[9px] text-red-600 line-through">{diffSlot!.teacherName}</p>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Diff legend */}
              {showDiff && (
                <div className="px-4 py-2 border-t border-line flex flex-wrap gap-3 text-xs text-slate">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200" />Added</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200" />Changed</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200"   />Removed</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-line" />Unchanged</span>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          {slots.length > 0 && (
            <p className="mt-2 text-xs text-slate flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {mode === "class"
                ? "Click to add/edit. Drag to empty cell to move. Drag onto a lesson to swap periods — teacher clashes are blocked automatically. Arrow keys navigate. Delete removes. ? for shortcuts."
                : "Teacher view is read-only. Switch to Class view to edit."}
            </p>
          )}
        </div>

        {/* Floating conflict panel */}
        {showConflictPanel && (
          <div className="shrink-0 w-full sm:w-80">
            <ConflictPanel
              summary={conflictSummary}
              onJumpTo={jumpToConflict}
              onNavigate={handleNavigateToRequirements}
              onAutoFix={handleAutoFix}
              onClose={() => setShowConflictPanel(false)}
              autoFixing={autoFixing}
            />
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editModal && mode === "class" && (() => {
        const currentClass = classes.find((c) => c.id === classId);
        const classForm = currentClass?.form;
        // Filter subjects: include all regular subjects + groups that match this class's form
        const filteredSubjects = subjects.filter((s) => {
          // Regular subjects (no isGroup flag) are always included
          if (!s.isGroup) return true;
          // Group subjects must match the class form
          if (classForm && s.applicableForms && s.applicableForms.length > 0) {
            return s.applicableForms.includes(classForm);
          }
          // If no form specified, exclude the group
          return false;
        });
        
        return (
          <SlotEditModal
            slot={editModal.slot}
            targetDay={editModal.day}
            targetPeriod={editModal.period}
            classId={classId}
            className={currentClass?.name ?? ""}
            subjects={filteredSubjects}
            teachers={teacherOptions}
            allSlots={slots}
            conflictCfg={conflictCfg}
            saving={modalSaving}
            error={modalError}
            onSave={handleSaveSlot}
            onClose={() => { setEditModal(null); setModalError(null); }}
          />
        );
      })()}

      {/* Keyboard shortcuts help */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
          onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-slate hover:text-ink">✕</button>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-line">
                {[
                  ["←↑→↓",        "Navigate cells"],
                  ["Enter",        "Edit focused cell"],
                  ["Delete",       "Remove lesson"],
                  ["Escape",       "Clear selection"],
                  ["Ctrl+Z",       "Undo"],
                  ["Ctrl+Y",       "Redo"],
                  ["Ctrl+C",       "Copy lesson"],
                  ["Ctrl+V",       "Paste lesson"],
                  ["?",            "Toggle this help"],
                ].map(([key, label]) => (
                  <tr key={key}>
                    <td className="py-1.5 pr-4">
                      <kbd className="px-1.5 py-0.5 bg-paper border border-line rounded text-[10px] font-mono">{key}</kbd>
                    </td>
                    <td className="py-1.5 text-slate">{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── History panel ─────────────────────────────────────────────── */}
      {showHistory && isDraft && (
        <div className="mt-4 bg-white border border-line rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-line">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <History className="h-4 w-4 text-teal" aria-hidden /> Change history
            </h3>
            <button onClick={() => setShowHistory(false)} className="text-slate hover:text-ink p-1">✕</button>
          </div>
          {historyLoading ? (
            <p className="p-5 text-sm text-slate animate-pulse">Loading…</p>
          ) : historyRows.length === 0 ? (
            <p className="p-5 text-sm text-slate">No changes recorded yet.</p>
          ) : (
            <div className="divide-y divide-line max-h-64 overflow-y-auto">
              {historyRows.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-start gap-3">
                  <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0
                    ${r.changeSource === "AI" ? "bg-purple-100 text-purple-700" : "bg-teal-50 text-teal"}`}>
                    {r.changeSource ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{r.actionLabel}</p>
                    {r.reason && <p className="text-xs text-slate mt-0.5 italic">{r.reason}</p>}
                    <p className="text-[10px] text-slate mt-0.5">
                      {r.performer?.email ?? "System"} · {new Date(r.performedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lock context menu ──────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-line rounded-xl shadow-xl py-1.5 w-52"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <p className="px-4 py-1.5 text-[10px] font-semibold text-slate uppercase tracking-wide border-b border-line">
            {contextMenu.slot.subjectCode} · {DAYS[contextMenu.slot.dayOfWeek]} P{contextMenu.slot.period}
          </p>
          {contextMenu.slot.isLocked ? (
            <button
              onClick={() => handleToggleLock(contextMenu.slot, contextMenu.slot.lockScope ?? "SLOT")}
              disabled={locking}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors"
            >
              <LockOpen className="h-4 w-4 text-teal shrink-0" aria-hidden /> Unlock this slot
            </button>
          ) : (
            <>
              {(["SLOT","SUBJECT","CLASS","DAY","TEACHER"] as const).map((scope) => (
                <button key={scope}
                  onClick={() => handleToggleLock(contextMenu.slot, scope)}
                  disabled={locking}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper transition-colors"
                >
                  <Lock className="h-4 w-4 text-slate shrink-0" aria-hidden />
                  Lock {scope === "SLOT" ? "this slot" : scope === "SUBJECT" ? "all lessons (subject)" : scope === "CLASS" ? "entire class" : scope === "DAY" ? "all class lessons today" : "all teacher lessons"}
                </button>
              ))}
            </>
          )}
          {!contextMenu.slot.isLocked && (
            <button
              onClick={() => { setContextMenu(null); handleDeleteSlot(contextMenu.slot); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors border-t border-line mt-1"
            >
              Remove lesson
            </button>
          )}
        </div>
      )}

      {/* Backdrop to close context menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      {/* ── Re-optimize preview modal ──────────────────────────────────── */}
      {reoptPreview && (
        <ReoptimizePreviewModal
          diff={reoptPreview.diff}
          stats={reoptPreview.stats}
          applying={reoptApplying}
          onApply={handleApplyReoptimize}
          onDiscard={() => setReoptPreview(null)}
        />
      )}
    </div>
  );
}

// ── SlotCell ──────────────────────────────────────────────────────────────

function SlotCell({
  slot, mode, hasError, hasWarning, conflicts, isDraft,
  onEdit, onDelete: _onDelete, onDragStart, onDragEnd, onContextMenu,
}: {
  slot:          LiveSlot;
  mode:          "class"|"teacher";
  hasError:      boolean;
  hasWarning:    boolean;
  conflicts:     CellConflict[];
  isDraft:       boolean;
  onEdit:        () => void;
  onDelete:      () => void;
  onDragStart:   (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd:     () => void;
  onContextMenu?:(e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const colors = colorFor(slot.subjectId);

  // Locked cells get a distinct teal-ring style
  const baseClass = slot.isLocked
    ? "bg-teal-50 border-teal-300 text-teal-800 ring-1 ring-inset ring-teal/30"
    : hasError
      ? CONFLICT_CELL
      : hasWarning
        ? WARN_CELL
        : `${colors[0]} ${colors[1]} ${colors[2]}`;

  const tooltip = slot.isLocked
    ? `🔒 Locked${slot.lockReason ? ` — ${slot.lockReason}` : ""}. Right-click to unlock.`
    : conflicts.map((c: CellConflict) => c.message).join("\n") || `${slot.subjectCode} — click to edit`;

  return (
    <button
      draggable={isDraft && mode === "class" && !slot.isLocked}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      onContextMenu={onContextMenu}
      title={tooltip}
      aria-label={[
        `${slot.subjectCode} lesson`,
        mode === "class" ? `teacher: ${slot.teacherName}` : `class: ${slot.className}`,
        slot.isLocked   ? "Locked"              : "",
        slot.isManual   ? "Manual override"     : "AI generated",
        hasError        ? "Has conflict errors" : "",
        hasWarning      ? "Has conflict warnings" : "",
      ].filter(Boolean).join(", ")}
      className={`w-full text-left rounded-lg border px-2 py-1.5 min-h-[60px] transition-all group
        hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30
        ${baseClass}
        ${slot.isLocked ? "" : hasError ? "animate-pulse-subtle" : ""}
        ${slot.isLocked ? "cursor-default" : ""}
      `}
    >
      {/* Top row: subject code + status icons */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-bold text-xs leading-tight">
            {slot.isGroupAnchor && slot.groupName ? `📦 ${slot.groupName}` : slot.subjectCode}
          </p>
          <p className="text-[10px] leading-tight opacity-80 mt-0.5 truncate">
            {mode === "class" 
              ? (slot.isGroupAnchor && (slot.allTeachers?.length ?? 0) > 1 
                  ? `${slot.allTeachers!.length} teachers` 
                  : slot.teacherName)
              : slot.className}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {slot.isLocked  && <Lock          className="h-3 w-3 text-teal"   aria-label="Locked"          />}
          {slot.isManual && !slot.isLocked && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-teal/15 text-teal leading-none" aria-label="Manual override">M</span>
          )}
          {hasError   && <AlertCircle   className="h-3 w-3 text-danger" aria-label="Conflict error"   />}
          {hasWarning && <AlertTriangle className="h-3 w-3 text-warn"   aria-label="Conflict warning" />}
        </div>
      </div>
      {slot.room && (
        <p className="text-[9px] opacity-50 mt-0.5 truncate">{slot.room}</p>
      )}
      {slot.isLocked && slot.lockReason && (
        <p className="text-[9px] text-teal/70 mt-0.5 truncate italic">{slot.lockReason}</p>
      )}
    </button>
  );
}

// (end of file)

// ── SchoolTimetableView ────────────────────────────────────────────────────
/**
 * Full-school timetable overview.
 *
 * Layout:
 *   • Rows = classes, grouped by form with collapsible form headers
 *   • Columns = days × periods (lesson slots only)
 *   • Each cell shows the subject code (coloured) + teacher initials
 *   • Clicking a cell (or the class row header) switches to single-class
 *     edit mode for that class
 *   • Search bar filters visible classes by name or form
 *   • Conflict dots on cells that have errors in the global conflict map
 */

type SchoolViewProps = {
  slots:          LiveSlot[];
  classes:        SchoolClass[];
  activeDays:     number[];
  lessonColumns:  TemplateColumn[];
  allColumns:     TemplateColumn[];
  searchFilter:   string;
  onSearchChange: (v: string) => void;
  loading:        boolean;
  onSelectClass:  (classId: string) => void;
  onRefresh:      () => void;
};

const SCHOOL_SUBJECT_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-lime-100 text-lime-800",
  "bg-indigo-100 text-indigo-800",
  "bg-pink-100 text-pink-800",
  "bg-sky-100 text-sky-800",
];

const schoolColorMap = new Map<string, string>();
let schoolColorIdx   = 0;

function schoolColorFor(subjectCode: string): string {
  if (!schoolColorMap.has(subjectCode)) {
    schoolColorMap.set(subjectCode, SCHOOL_SUBJECT_COLORS[schoolColorIdx++ % SCHOOL_SUBJECT_COLORS.length]);
  }
  return schoolColorMap.get(subjectCode)!;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SchoolTimetableView({
  slots, classes, activeDays, lessonColumns, allColumns,
  searchFilter, onSearchChange, loading, onSelectClass, onRefresh,
}: SchoolViewProps) {

  // Build conflict set: "classId|day-period" for error cells
  const errorCells = useMemo(() => {
    const set = new Set<string>();
    // "teacherId|day-period" → array of { cellKey, groupId }
    const teacherSlotMap = new Map<string, Array<{ cellKey: string; groupId: string | null | undefined }>>();
    for (const s of slots) {
      const tk = `${s.teacherId}|${s.dayOfWeek}-${s.period}`;
      if (!teacherSlotMap.has(tk)) teacherSlotMap.set(tk, []);
      teacherSlotMap.get(tk)!.push({
        cellKey: `${s.classId}|${s.dayOfWeek}-${s.period}`,
        groupId: s.groupId,
      });
    }
    for (const [, entries] of teacherSlotMap) {
      if (entries.length <= 1) continue;
      // Check every pair — flag the whole bucket only if at least one pair
      // is a genuine clash (different groupIds, or either groupId is null).
      let hasRealClash = false;
      outer: for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          // Same non-null groupId → intentional co-teaching, not a clash
          if (a.groupId != null && b.groupId != null && a.groupId === b.groupId) continue;
          hasRealClash = true;
          break outer;
        }
      }
      if (hasRealClash) {
        entries.forEach(({ cellKey }) => set.add(cellKey));
      }
    }
    return set;
  }, [slots]);

  // Build slot lookup: "classId|day-period" → slot
  // After server-side collapseGroupSlotsForDisplay, a group of N subjects
  // at the same (classId, day, period) is represented by a single anchor slot.
  // We use set-if-absent (not overwrite) so the first slot wins — that is
  // always the group representative emitted by the collapse function.
  // This also protects against any edge-case where collapse is bypassed and
  // raw fan-out slots arrive: the first subject in the group still wins rather
  // than a random last one overwriting it and leaving the rest as empty cells.
  const slotMap = useMemo(() => {
    const m = new Map<string, LiveSlot>();
    for (const s of slots) {
      const key = `${s.classId}|${s.dayOfWeek}-${s.period}`;
      if (!m.has(key)) m.set(key, s);
    }
    return m;
  }, [slots]);

  // Lesson columns only (skip breaks/lunch etc.)
  const lessonCols = useMemo(
    () => lessonColumns.length > 0
      ? lessonColumns
      : allColumns.filter((c) => c.slotType === "LESSON"),
    [lessonColumns, allColumns]
  );

  // Period numbers (1-based)
  const periods = useMemo(
    () => lessonCols.map((_, i) => i + 1),
    [lessonCols]
  );

  // Group and filter classes by form
  const filteredByForm = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const map = new Map<number, SchoolClass[]>();
    for (const cls of classes) {
      const match = !q
        || cls.name.toLowerCase().includes(q)
        || `form ${cls.form}`.includes(q)
        || String(cls.form) === q;
      if (!match) continue;
      if (!map.has(cls.form)) map.set(cls.form, []);
      map.get(cls.form)!.push(cls);
    }
    return map;
  }, [classes, searchFilter]);

  // Collapsible form groups
  const [collapsedForms, setCollapsedForms] = useState<Set<number>>(new Set());
  function toggleForm(form: number) {
    setCollapsedForms((prev) => {
      const n = new Set(prev);
      if (n.has(form)) { n.delete(form); } else { n.add(form); }
      return n;
    });
  }

  const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading) {
    return (
      <div className="bg-white border border-line rounded-xl p-10 text-center text-slate text-sm animate-pulse">
        Loading full school timetable…
      </div>
    );
  }

  const totalClasses   = classes.length;
  const filledClasses  = new Set(slots.map((s) => s.classId)).size;
  const totalSlots     = activeDays.length * periods.length * totalClasses;
  const filledSlots    = slots.length;
  const coveragePct    = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by class or form…"
            className="w-full pl-8 pr-8 py-2 text-sm border border-line rounded-lg bg-paper
                       focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40"
          />
          {searchFilter && (
            <button onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Coverage stats */}
        <div className="flex items-center gap-4 text-xs text-slate ml-auto shrink-0">
          <span><strong className="text-ink">{filledClasses}</strong>/{totalClasses} classes scheduled</span>
          <span>
            <strong className={coveragePct === 100 ? "text-success" : coveragePct > 80 ? "text-ink" : "text-warn"}>
              {coveragePct}%
            </strong> coverage
          </span>
          <button onClick={onRefresh} title="Refresh"
            className="p-1.5 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {filteredByForm.size === 0 ? (
        <div className="bg-white border border-line rounded-xl p-10 text-center">
          <LayoutGrid className="h-10 w-10 text-slate/25 mx-auto mb-3" />
          <p className="text-sm text-slate">
            {searchFilter ? `No classes match "${searchFilter}"` : "No classes found."}
          </p>
        </div>
      ) : (
        /* ── Master timetable table ─────────────────────────── */
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: `${200 + activeDays.length * periods.length * 52}px` }}>
              <thead>
                {/* ── Day header row ── */}
                <tr className="bg-slate-50 border-b border-line">
                  <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold text-slate uppercase tracking-wide border-r border-line min-w-[140px]">
                    Class
                  </th>
                  {activeDays.map((day) => (
                    <th key={day}
                      colSpan={periods.length}
                      className="px-2 py-2 text-center text-[10px] font-semibold text-slate uppercase tracking-wide border-r border-line last:border-r-0">
                      {DAY_SHORT[day]}
                    </th>
                  ))}
                </tr>
                {/* ── Period sub-header row ── */}
                <tr className="bg-paper border-b-2 border-line">
                  <th className="sticky left-0 z-20 bg-paper border-r border-line" />
                  {activeDays.map((day) =>
                    periods.map((p) => (
                      <th key={`${day}-${p}`}
                        className="px-1 py-1.5 text-center text-[9px] font-medium text-slate/70 border-r border-line last:border-r-0 min-w-[48px]">
                        P{p}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from(filteredByForm.entries()).map(([form, formClasses]) => {
                  const isCollapsed = collapsedForms.has(form);
                  return (
                    <>
                      {/* ── Form group header ── */}
                      <tr key={`form-${form}`} className="bg-teal/5 border-b border-line">
                        <td
                          colSpan={activeDays.length * periods.length + 1}
                          className="sticky left-0 px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => toggleForm(form)}
                            className="flex items-center gap-2 text-xs font-semibold text-teal hover:text-teal-dark transition-colors"
                          >
                            {isCollapsed
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronUp   className="h-3.5 w-3.5" />
                            }
                            Form {form}
                            <span className="text-slate font-normal">
                              — {formClasses.length} class{formClasses.length !== 1 ? "es" : ""}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* ── Class rows ── */}
                      {!isCollapsed && formClasses.map((cls, rowIdx) => (
                        <tr key={cls.id}
                          className={`border-b border-line transition-colors hover:bg-teal/4 group
                            ${rowIdx % 2 === 0 ? "bg-white" : "bg-paper/30"}`}>
                          {/* Class name cell */}
                          <td className="sticky left-0 z-10 bg-inherit border-r border-line px-3 py-1.5 min-w-[140px]">
                            <button
                              type="button"
                              onClick={() => onSelectClass(cls.id)}
                              className="text-left w-full"
                              title={`Edit ${cls.name} timetable`}
                            >
                              <span className="text-xs font-semibold text-teal group-hover:underline">
                                {cls.name}
                              </span>
                            </button>
                          </td>

                          {/* Lesson cells */}
                          {activeDays.map((day) =>
                            periods.map((period) => {
                              const key   = `${cls.id}|${day}-${period}`;
                              const slot  = slotMap.get(key);
                              const clash = errorCells.has(key);

                              return (
                                <td key={`${day}-${period}`}
                                  className={`border-r border-line last:border-r-0 p-0.5 align-top
                                    ${clash ? "bg-danger/8" : ""}`}>
                                  {slot ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectClass(cls.id)}
                                      title={`${slot.isGroupAnchor && slot.groupName ? slot.groupName : slot.subjectCode} — ${slot.teacherName}\nClick to edit ${cls.name}`}
                                      className={`w-full rounded px-1 py-0.5 text-left transition-all
                                        hover:brightness-95 active:scale-[0.97]
                                        ${schoolColorFor(slot.isGroupAnchor && slot.groupName ? slot.groupName : slot.subjectCode)}
                                        ${clash ? "ring-1 ring-danger" : ""}
                                      `}
                                    >
                                      <p className="font-bold text-[9px] leading-tight truncate">
                                        {slot.isGroupAnchor && slot.groupName ? slot.groupName : slot.subjectCode}
                                      </p>
                                      <p className="text-[8px] leading-tight opacity-70 truncate">
                                        {initials(slot.teacherName)}
                                      </p>
                                      {clash && (
                                        <span className="block w-1.5 h-1.5 rounded-full bg-danger mt-0.5 mx-auto" aria-label="Clash" />
                                      )}
                                    </button>
                                  ) : (
                                    <div className="w-full h-[30px] rounded border border-dashed border-line/40
                                                    hover:border-teal/30 hover:bg-teal/4 transition-colors cursor-pointer"
                                      onClick={() => onSelectClass(cls.id)}
                                      title={`Empty — click to open ${cls.name}`}
                                    />
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Legend ── */}
          <div className="px-4 py-2.5 border-t border-line flex flex-wrap gap-4 text-[10px] text-slate bg-paper/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-8 h-3.5 rounded bg-teal-100 border border-teal-200" />
              Scheduled lesson (colour = subject)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-8 h-3.5 rounded border-2 border-dashed border-line/60" />
              Empty slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger" />
              Teacher clash
            </span>
            <span className="ml-auto italic">Click any cell or class name to open the full class editor</span>
          </div>
        </div>
      )}
    </div>
  );
}
