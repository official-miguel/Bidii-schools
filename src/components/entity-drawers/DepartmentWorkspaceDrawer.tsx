"use client";

/**
 * DepartmentWorkspaceDrawer
 *
 * Slide-over workspace for a department entity. Displays:
 *  - Department info and head of department (with assign / reassign)
 *  - Staff assigned to the department
 *  - Subjects owned by the department (with add / move-out management)
 *
 * Cross-navigation: clicking a teacher opens StaffProfileDrawer.
 * Clicking a subject opens SubjectWorkspaceDrawer.
 */

import { useEffect, useRef, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import {
  BookOpen,
  Users,
  Crown,
  ExternalLink,
  XCircle,
  Pencil,
  ChevronDown,
  Plus,
  ArrowRightLeft,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DepartmentDetail {
  id: string;
  name: string;
  headTeacher: { id: string; fullName: string; email: string | null } | null;
  subjects: { id: string; name: string; code: string; type: "CORE" | "ELECTIVE" }[];
  teachers: { id: string; fullName: string; email: string | null; staffId: string }[];
  _count: { subjects: number; teachers: number };
}

interface StaffOption {
  id: string;
  fullName: string;
  staffId: string;
  teacherSubjects?: { subject: { id: string; name: string; departmentId: string } }[];
}

interface AvailableSubject {
  id: string;
  name: string;
  code: string;
  type: "CORE" | "ELECTIVE";
  department: { id: string; name: string };
}

interface Props {
  departmentId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenStaff?: (staffId: string, staffName: string) => void;
  onOpenSubject?: (subjectId: string, subjectName: string) => void;
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-1.5">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DepartmentWorkspaceDrawer({
  departmentId,
  open,
  onClose,
  onOpenStaff,
  onOpenSubject,
  basePath = "/principal",
}: Props) {
  const [dept, setDept]       = useState<DepartmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // HOD assign / reassign state
  const [staffOptions, setStaffOptions]   = useState<StaffOption[]>([]);
  const [assigningHOD, setAssigningHOD]   = useState(false);
  const [hodPickerOpen, setHodPickerOpen] = useState(false);
  const [hodSearch, setHodSearch]         = useState("");
  const [hodSaving, setHodSaving]         = useState(false);
  const [hodError, setHodError]           = useState<string | null>(null);
  const hodPickerRef                      = useRef<HTMLDivElement>(null);

  // Subject management state
  const [availableSubjects, setAvailableSubjects]     = useState<AvailableSubject[]>([]);
  const [addingSubject, setAddingSubject]             = useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen]     = useState(false);
  const [subjectSearch, setSubjectSearch]             = useState("");
  const [subjectSaving, setSubjectSaving]             = useState<string | null>(null); // subjectId being saved
  const [subjectError, setSubjectError]               = useState<string | null>(null);
  const subjectPickerRef                              = useRef<HTMLDivElement>(null);

  // Move-out: pick a new department for a subject being removed
  const [movingSubjectId, setMovingSubjectId]         = useState<string | null>(null);
  const [allDepts, setAllDepts]                       = useState<{ id: string; name: string }[]>([]);
  const [movePickerOpen, setMovePickerOpen]           = useState(false);
  const [moveSaving, setMoveSaving]                   = useState(false);
  const [moveError, setMoveError]                     = useState<string | null>(null);
  const movePickerRef                                 = useRef<HTMLDivElement>(null);

  // ── Fetch department detail ───────────────────────────────────────────────
  const refreshDept = async () => {
    if (!departmentId) return;
    const d = await fetch(`/api/departments/${departmentId}/detail`).then((r) => r.json());
    if (!d.error) setDept(d);
  };

  useEffect(() => {
    if (!open || !departmentId) return;
    setDept(null); setError(null); setLoading(true);
    fetch(`/api/departments/${departmentId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDept(d);
      })
      .catch((e) => setError(e.message || "Couldn't load department details."))
      .finally(() => setLoading(false));
  }, [open, departmentId]);

  // ── Reset all state when drawer closes ───────────────────────────────────
  useEffect(() => {
    if (!open) {
      setAssigningHOD(false);
      setHodPickerOpen(false);
      setHodSearch("");
      setHodError(null);
      setAddingSubject(false);
      setSubjectPickerOpen(false);
      setSubjectSearch("");
      setSubjectError(null);
      setAvailableSubjects([]);
      setMovingSubjectId(null);
      setMovePickerOpen(false);
      setMoveError(null);
    }
  }, [open]);

  // ── Fetch staff list when entering HOD assign mode ───────────────────────
  useEffect(() => {
    if (!assigningHOD || staffOptions.length > 0) return;
    fetch("/api/staff")
      .then((r) => r.json())
      .then((data: StaffOption[]) => setStaffOptions(data))
      .catch(() => setHodError("Couldn't load staff list."));
  }, [assigningHOD, staffOptions.length]);

  // ── Fetch available subjects when entering add-subject mode ──────────────
  useEffect(() => {
    if (!addingSubject || !departmentId) return;
    setSubjectError(null);
    fetch(`/api/departments/${departmentId}/available-subjects`)
      .then((r) => r.json())
      .then((data: AvailableSubject[]) => setAvailableSubjects(data))
      .catch(() => setSubjectError("Couldn't load subjects."));
  }, [addingSubject, departmentId]);

  // ── Fetch all departments when entering move-out mode ────────────────────
  useEffect(() => {
    if (!movingSubjectId || allDepts.length > 0) return;
    fetch("/api/departments")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setAllDepts(data.filter((d) => d.id !== departmentId))
      )
      .catch(() => setMoveError("Couldn't load departments."));
  }, [movingSubjectId, allDepts.length, departmentId]);

  // ── Outside-click: HOD picker ─────────────────────────────────────────────
  useEffect(() => {
    if (!hodPickerOpen) return;
    function handle(e: MouseEvent) {
      if (hodPickerRef.current && !hodPickerRef.current.contains(e.target as Node))
        setHodPickerOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [hodPickerOpen]);

  // ── Outside-click: subject add picker ────────────────────────────────────
  useEffect(() => {
    if (!subjectPickerOpen) return;
    function handle(e: MouseEvent) {
      if (subjectPickerRef.current && !subjectPickerRef.current.contains(e.target as Node))
        setSubjectPickerOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [subjectPickerOpen]);

  // ── Outside-click: move-to picker ────────────────────────────────────────
  useEffect(() => {
    if (!movePickerOpen) return;
    function handle(e: MouseEvent) {
      if (movePickerRef.current && !movePickerRef.current.contains(e.target as Node))
        setMovePickerOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [movePickerOpen]);

  // ── HOD save ─────────────────────────────────────────────────────────────
  async function saveHOD(teacherId: string | null) {
    if (!departmentId || !dept) return;
    setHodSaving(true);
    setHodError(null);
    try {
      const res = await fetch(`/api/departments/${departmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headTeacherId: teacherId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update HOD.");
      await refreshDept();
      setAssigningHOD(false);
      setHodSearch("");
    } catch (e) {
      setHodError((e as Error).message);
    } finally {
      setHodSaving(false);
    }
  }

  // ── Add a subject to this department ─────────────────────────────────────
  async function addSubjectToDept(subject: AvailableSubject) {
    if (!departmentId) return;
    setSubjectSaving(subject.id);
    setSubjectError(null);
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update subject.");
      // Remove from available list locally and refresh dept
      setAvailableSubjects((prev) => prev.filter((s) => s.id !== subject.id));
      await refreshDept();
    } catch (e) {
      setSubjectError((e as Error).message);
    } finally {
      setSubjectSaving(null);
    }
  }

  // ── Move a subject out to another department ──────────────────────────────
  async function moveSubjectToDept(subjectId: string, targetDeptId: string) {
    setMoveSaving(true);
    setMoveError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: targetDeptId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't move subject.");
      setMovingSubjectId(null);
      setMovePickerOpen(false);
      // Invalidate available subjects cache so re-opening add mode is fresh
      setAvailableSubjects([]);
      await refreshDept();
    } catch (e) {
      setMoveError((e as Error).message);
    } finally {
      setMoveSaving(false);
    }
  }

  // ── Derived filtered lists ────────────────────────────────────────────────
  const eligibleStaff = staffOptions.filter((s) =>
    s.teacherSubjects?.some((ts) => ts.subject.departmentId === dept?.id)
  );
  const filteredStaff = eligibleStaff.filter(
    (s) =>
      s.fullName.toLowerCase().includes(hodSearch.toLowerCase()) ||
      s.staffId.toLowerCase().includes(hodSearch.toLowerCase())
  );

  const filteredAvailable = availableSubjects.filter(
    (s) =>
      s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      s.department.name.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  // Which subject is currently selected for moving out
  const movingSubject = dept?.subjects.find((s) => s.id === movingSubjectId) ?? null;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={dept?.name ?? "Department workspace"}
      description={
        dept
          ? `${dept._count.teachers} staff · ${dept._count.subjects} subjects`
          : undefined
      }
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
          <XCircle className="h-4 w-4 text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {dept && !loading && (
        <div className="space-y-5">

          {/* ── Overview ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <h2 className="text-base font-semibold text-ink mb-3">{dept.name}</h2>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <Users className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{dept._count.teachers}</span>
                <span className="text-xs text-slate">staff</span>
              </div>
              <div className="flex items-center gap-1.5 bg-paper border border-line rounded-lg px-3 py-1.5">
                <BookOpen className="h-3.5 w-3.5 text-slate" />
                <span className="text-sm font-medium text-ink">{dept._count.subjects}</span>
                <span className="text-xs text-slate">subjects</span>
              </div>
            </div>
          </div>

          {/* ── Head of department ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>
                <Crown className="h-3.5 w-3.5" />
                Head of department
              </SectionTitle>
              {!assigningHOD && (
                <button
                  type="button"
                  onClick={() => setAssigningHOD(true)}
                  className="flex items-center gap-1 text-xs text-teal hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  {dept.headTeacher ? "Reassign" : "Assign"}
                </button>
              )}
            </div>

            {/* Current HOD display */}
            {!assigningHOD && (
              dept.headTeacher ? (
                <div className="flex items-center gap-3">
                  <Avatar name={dept.headTeacher.fullName} size="md" />
                  <div className="flex-1 min-w-0">
                    {onOpenStaff ? (
                      <button
                        type="button"
                        onClick={() => onOpenStaff(dept.headTeacher!.id, dept.headTeacher!.fullName)}
                        className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                      >
                        {dept.headTeacher.fullName}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <p className="text-sm font-medium text-ink">{dept.headTeacher.fullName}</p>
                    )}
                    {dept.headTeacher.email && (
                      <p className="text-xs text-slate truncate">{dept.headTeacher.email}</p>
                    )}
                  </div>
                  <Chip variant="teal" size="xs">HOD</Chip>
                </div>
              ) : (
                <p className="text-sm text-slate italic">No head of department assigned.</p>
              )
            )}

            {/* Assign / reassign picker */}
            {assigningHOD && (
              <div className="space-y-3">
                <div className="relative" ref={hodPickerRef}>
                  <button
                    type="button"
                    onClick={() => setHodPickerOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink hover:border-teal transition-colors"
                  >
                    <span className="truncate">{hodSearch || "Search staff…"}</span>
                    <ChevronDown className="h-4 w-4 text-slate shrink-0" />
                  </button>
                  {hodPickerOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-line">
                        <input
                          autoFocus
                          value={hodSearch}
                          onChange={(e) => setHodSearch(e.target.value)}
                          placeholder="Search by name or staff ID…"
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-teal"
                        />
                      </div>
                      <ul className="max-h-48 overflow-y-auto">
                        {filteredStaff.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate italic">
                            {eligibleStaff.length === 0
                              ? "No teachers are assigned subjects in this department."
                              : "No matching staff found."}
                          </li>
                        ) : (
                          filteredStaff.map((s) => {
                            const deptSubjects = s.teacherSubjects
                              ?.filter((ts) => ts.subject.departmentId === dept.id)
                              .map((ts) => ts.subject.name)
                              .join(", ");
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHodSearch(s.fullName);
                                    setHodPickerOpen(false);
                                    saveHOD(s.id);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-paper transition-colors"
                                >
                                  <Avatar name={s.fullName} size="sm" />
                                  <div className="flex-1 min-w-0">
                                    <span className="block font-medium text-ink truncate">{s.fullName}</span>
                                    {deptSubjects && (
                                      <span className="block text-xs text-slate truncate">{deptSubjects}</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-slate font-mono shrink-0">{s.staffId}</span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                      {dept.headTeacher && (
                        <div className="border-t border-line p-2">
                          <button
                            type="button"
                            onClick={() => { setHodPickerOpen(false); saveHOD(null); }}
                            className="w-full text-xs text-danger hover:underline py-1"
                          >
                            Remove HOD assignment
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {hodSaving && (
                  <div className="flex items-center gap-2 text-sm text-slate">
                    <Spinner size="sm" /> Saving…
                  </div>
                )}
                {hodError && <p className="text-xs text-danger">{hodError}</p>}
                <button
                  type="button"
                  onClick={() => { setAssigningHOD(false); setHodSearch(""); setHodError(null); }}
                  className="text-xs text-slate hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ── Subjects ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>
                <BookOpen className="h-3.5 w-3.5" />
                Subjects ({dept._count.subjects})
              </SectionTitle>
              {!addingSubject && !movingSubjectId && (
                <button
                  type="button"
                  onClick={() => { setAddingSubject(true); setSubjectPickerOpen(true); }}
                  className="flex items-center gap-1 text-xs text-teal hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Add subject
                </button>
              )}
            </div>

            {/* Current subjects list */}
            {dept.subjects.length === 0 && !addingSubject ? (
              <p className="text-sm text-slate italic">No subjects assigned yet.</p>
            ) : (
              <div className="space-y-1.5">
                {dept.subjects.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0">
                        {s.code}
                      </span>
                      {onOpenSubject ? (
                        <button
                          type="button"
                          onClick={() => onOpenSubject(s.id, s.name)}
                          className="text-sm text-teal hover:underline flex items-center gap-1 truncate"
                        >
                          {s.name}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                      ) : (
                        <span className="text-sm text-ink truncate">{s.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                        {s.type === "CORE" ? "Core" : "Elective"}
                      </Chip>
                      {/* Move-out button: reassign subject to another department */}
                      {!addingSubject && (
                        <button
                          type="button"
                          title="Move to another department"
                          onClick={() => {
                            setMovingSubjectId(s.id);
                            setMovePickerOpen(true);
                            setMoveError(null);
                          }}
                          className="p-1 rounded hover:bg-paper text-slate hover:text-ink transition-colors"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Move-to-department picker ── */}
            {movingSubjectId && movingSubject && (
              <div className="mt-3 rounded-lg border border-line bg-paper p-3 space-y-2">
                <p className="text-xs font-medium text-ink">
                  Move <span className="text-teal">{movingSubject.name}</span> to…
                </p>
                <div className="relative" ref={movePickerRef}>
                  <button
                    type="button"
                    onClick={() => setMovePickerOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink hover:border-teal transition-colors"
                  >
                    <span className="truncate text-slate">Select department…</span>
                    <ChevronDown className="h-4 w-4 text-slate shrink-0" />
                  </button>
                  {movePickerOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                      <ul className="max-h-48 overflow-y-auto">
                        {allDepts.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate italic">
                            {allDepts.length === 0 ? "Loading…" : "No other departments."}
                          </li>
                        ) : (
                          allDepts.map((d) => (
                            <li key={d.id}>
                              <button
                                type="button"
                                disabled={moveSaving}
                                onClick={() => moveSubjectToDept(movingSubjectId, d.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper transition-colors disabled:opacity-50"
                              >
                                {d.name}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                {moveSaving && (
                  <div className="flex items-center gap-2 text-xs text-slate">
                    <Spinner size="sm" /> Moving…
                  </div>
                )}
                {moveError && <p className="text-xs text-danger">{moveError}</p>}
                <button
                  type="button"
                  onClick={() => { setMovingSubjectId(null); setMovePickerOpen(false); setMoveError(null); }}
                  className="text-xs text-slate hover:text-ink flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </div>
            )}

            {/* ── Add subject picker ── */}
            {addingSubject && (
              <div className="mt-3 space-y-2">
                <div className="relative" ref={subjectPickerRef}>
                  <button
                    type="button"
                    onClick={() => setSubjectPickerOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-teal bg-paper px-3 py-2 text-sm text-ink transition-colors"
                  >
                    <span className="truncate text-slate">Search subjects to add…</span>
                    <ChevronDown className="h-4 w-4 text-slate shrink-0" />
                  </button>
                  {subjectPickerOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-white shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-line">
                        <input
                          autoFocus
                          value={subjectSearch}
                          onChange={(e) => setSubjectSearch(e.target.value)}
                          placeholder="Search by name, code or current department…"
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-line bg-paper outline-none focus:border-teal"
                        />
                      </div>
                      <ul className="max-h-56 overflow-y-auto">
                        {filteredAvailable.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate italic">
                            {availableSubjects.length === 0
                              ? "All school subjects are already in this department."
                              : "No subjects match your search."}
                          </li>
                        ) : (
                          filteredAvailable.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                disabled={subjectSaving === s.id}
                                onClick={() => {
                                  setSubjectPickerOpen(false);
                                  setSubjectSearch("");
                                  addSubjectToDept(s);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-paper transition-colors disabled:opacity-50"
                              >
                                <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0 w-14 text-center">
                                  {s.code}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="block font-medium text-ink truncate">{s.name}</span>
                                  <span className="block text-xs text-slate truncate">
                                    Currently: {s.department.name}
                                  </span>
                                </div>
                                <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                                  {s.type === "CORE" ? "Core" : "Elective"}
                                </Chip>
                                {subjectSaving === s.id && <Spinner size="sm" />}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                {subjectError && <p className="text-xs text-danger">{subjectError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setAddingSubject(false);
                    setSubjectPickerOpen(false);
                    setSubjectSearch("");
                    setSubjectError(null);
                  }}
                  className="text-xs text-slate hover:text-ink flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Done
                </button>
              </div>
            )}
          </div>

          {/* ── Staff ── */}
          {dept.teachers.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <SectionTitle>
                <Users className="h-3.5 w-3.5" />
                Staff ({dept._count.teachers})
              </SectionTitle>
              <div className="space-y-2">
                {dept.teachers.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-1 border-b border-line last:border-0">
                    <Avatar name={t.fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      {onOpenStaff ? (
                        <button
                          type="button"
                          onClick={() => onOpenStaff(t.id, t.fullName)}
                          className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                        >
                          {t.fullName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-ink">{t.fullName}</p>
                      )}
                      <p className="text-xs text-slate font-mono">{t.staffId}</p>
                    </div>
                  </div>
                ))}
              </div>
              {dept._count.teachers > dept.teachers.length && (
                <a
                  href={`${basePath}/staff?dept=${dept.id}`}
                  className="block mt-3 text-xs text-center text-teal hover:underline"
                >
                  View all staff →
                </a>
              )}
            </div>
          )}

          {/* ── Quick links ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <SectionTitle>Quick links</SectionTitle>
            <div className="space-y-2">
              <a href={`${basePath}/departments`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                All departments
              </a>
              <a href={`${basePath}/subjects`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Subject list
              </a>
            </div>
          </div>

        </div>
      )}
    </SlideOver>
  );
}
