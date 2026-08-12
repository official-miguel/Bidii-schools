"use client";

/**
 * /principal/class-profiles/[classId]
 *
 * Per-class subject profile:
 *  • ElectiveGroupsClassView  — read-through of groups defined in requirements,
 *    with per-class teacher assignment (add/remove). Multiple teachers per
 *    subject are supported — each represents a distinct student sub-group.
 *  • Ungrouped subjects table — core/elective type toggles for subjects that
 *    are NOT part of any elective group.
 */

import { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import {
  PageHeader,
  ErrorBanner,
  Chip,
  primaryButtonClass,
  secondaryButtonClass,
  inputClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import {
  CheckCircle2, Layers, User, Plus, X,
  ExternalLink, Info, BookOpen, Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ClassInfo = {
  id: string;
  name: string;
  form: number;
  stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE";
  classTeacher: { id: string; fullName: string } | null;
};

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  globalType: "CORE" | "ELECTIVE";
  effectiveType: "CORE" | "ELECTIVE";
  department: { id: string; name: string };
};

type ClassTeacherPairing = {
  id: string;
  groupId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  subject: { id: string; code: string; name: string };
  teacher: { id: string; fullName: string };
};

type GroupMember = {
  id: string;
  subjectId: string;
  subject: { id: string; code: string; name: string };
};

type ElectiveGroup = {
  id: string;
  name: string;
  scopeForm: number;
  scopeStreams: string[];
  lessonsPerWeek: number;
  members: GroupMember[];
  classTeachers: ClassTeacherPairing[];
};

type PageData = {
  class: ClassInfo;
  subjects: SubjectRow[];
  electiveGroups: ElectiveGroup[];
};

type StaffTeacher = {
  id: string;
  fullName: string;
  teacherSubjects: { subject: { id: string; name: string; code: string } }[];
};

// ── TypeToggle ─────────────────────────────────────────────────────────────

function TypeToggle({
  subjectId,
  value,
  onChange,
  hasOverride,
}: {
  subjectId: string;
  value: "CORE" | "ELECTIVE";
  onChange: (id: string, type: "CORE" | "ELECTIVE") => void;
  hasOverride: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(subjectId, "CORE")}
        className={`text-xs font-medium rounded-l-md border px-2.5 py-1.5 transition-colors ${
          value === "CORE"
            ? "bg-teal text-white border-teal"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}
      >
        Core
      </button>
      <button
        type="button"
        onClick={() => onChange(subjectId, "ELECTIVE")}
        className={`text-xs font-medium rounded-r-md border-t border-b border-r px-2.5 py-1.5 transition-colors ${
          value === "ELECTIVE"
            ? "bg-amber-500 text-white border-amber-500"
            : "bg-white text-slate border-line hover:bg-slate-50"
        }`}
      >
        Elective
      </button>
      {hasOverride && (
        <span className="ml-1 text-[10px] text-teal font-medium" title="Overrides global default">
          *
        </span>
      )}
    </div>
  );
}

// ── ElectiveGroupsClassView ────────────────────────────────────────────────
// Read-through view of groups from timetable requirements.
// Teacher assignment is PER CLASS: each subject in a group can have one or
// more teachers for this class, each row = a distinct student sub-group.

function ElectiveGroupsClassView({
  groups,
  classId: _classId,
  allTeachers,
  onAddTeacher,
  onRemoveTeacher,
  mutating,
}: {
  groups: ElectiveGroup[];
  classId: string;
  allTeachers: StaffTeacher[];
  onAddTeacher: (groupId: string, subjectId: string, teacherId: string) => Promise<void>;
  onRemoveTeacher: (groupId: string, subjectId: string, teacherId: string) => Promise<void>;
  mutating: Record<string, boolean>;
}) {
  const [pickerState, setPickerState] = useState<{ groupId: string; subjectId: string } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerState(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-5 py-8 text-center mb-6">
        <Layers className="h-8 w-8 text-violet-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-violet-700">No elective groups defined yet.</p>
        <p className="text-xs text-violet-500 mt-1 max-w-sm mx-auto">
          Create groups in{" "}
          <Link
            href="/principal/timetable/requirements"
            className="underline hover:text-violet-700 inline-flex items-center gap-0.5"
          >
            Timetable → Requirements <ExternalLink className="h-3 w-3" />
          </Link>
          . They will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-ink">Elective Groups</span>
        <Chip variant="purple" size="xs">{groups.length}</Chip>
        <Link
          href="/principal/timetable/requirements"
          className="ml-auto text-xs text-violet-600 hover:underline flex items-center gap-1"
        >
          Manage groups <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-4 py-2.5 flex gap-2 text-xs text-violet-700">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-400" />
        <span>
          Assign the teacher(s) for each subject in this class. If students in the same class
          have different teachers for a subject, add each one — each row represents a distinct
          student sub-group.
        </span>
      </div>

      {groups.map((group) => {
        const streamLabel =
          group.scopeStreams.length > 0 ? group.scopeStreams.join(", ") : "all streams";

        return (
          <div
            key={group.id}
            className="rounded-xl border border-violet-200 bg-white overflow-hidden shadow-xs"
          >
            {/* Group header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-violet-50/60 border-b border-violet-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 shrink-0">
                <Layers className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <span className="text-sm font-semibold text-ink flex-1">{group.name}</span>
              <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium border border-violet-200">
                {group.lessonsPerWeek} lessons/wk
              </span>
              {group.scopeForm > 0 && (
                <span className="text-[10px] text-slate/60 shrink-0 hidden sm:block">
                  Form {group.scopeForm} · {streamLabel}
                </span>
              )}
            </div>

            {/* Subjects */}
            <div className="divide-y divide-violet-50">
              {group.members.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate/50 italic">
                  No subjects in this group yet — add them in Timetable → Requirements.
                </p>
              )}

              {group.members.map((member) => {
                const subjectPairings = group.classTeachers.filter(
                  (t) => t.subjectId === member.subjectId,
                );
                const isPicking =
                  pickerState?.groupId === group.id &&
                  pickerState?.subjectId === member.subjectId;
                const mutKey = `${group.id}:${member.subjectId}`;
                const isMutating = mutating[mutKey] ?? false;

                const alreadyAssigned = new Set(subjectPairings.map((t) => t.teacherId));
                // All non-assigned teachers are eligible; those formally linked
                // to this subject are sorted to the top as "suggested".
                const linkedIds = new Set(
                  allTeachers
                    .filter((t) => t.teacherSubjects.some((ts) => ts.subject.id === member.subjectId))
                    .map((t) => t.id),
                );
                const eligible = allTeachers
                  .filter((t) => !alreadyAssigned.has(t.id))
                  .sort((a, b) => {
                    const aLinked = linkedIds.has(a.id) ? 0 : 1;
                    const bLinked = linkedIds.has(b.id) ? 0 : 1;
                    if (aLinked !== bLinked) return aLinked - bLinked;
                    return a.fullName.localeCompare(b.fullName);
                  });
                const filtered = eligible.filter(
                  (t) =>
                    pickerQuery === "" ||
                    t.fullName.toLowerCase().includes(pickerQuery.toLowerCase()),
                );

                return (
                  <div key={member.subjectId} className="px-4 py-3.5">
                    {/* Subject name */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <BookOpen className="h-3.5 w-3.5 text-slate/40 shrink-0" />
                      <span className="text-sm font-medium text-ink flex-1">
                        {member.subject.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate bg-slate-100 px-1.5 py-0.5 rounded">
                        {member.subject.code}
                      </span>
                    </div>

                    {/* Assigned teacher rows */}
                    <div className="space-y-1.5 mb-2.5 ml-5">
                      {subjectPairings.length === 0 && (
                        <p className="text-xs text-slate/50 italic">No teacher assigned yet.</p>
                      )}
                      {subjectPairings.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-1.5 group"
                        >
                          <User className="h-3 w-3 text-teal shrink-0" />
                          <span className="text-xs text-ink flex-1">{t.teacher.fullName}</span>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => onRemoveTeacher(group.id, member.subjectId, t.teacherId)}
                            className="p-0.5 rounded hover:bg-red-50 text-slate/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Remove this teacher"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add teacher picker */}
                    <div className="relative ml-5" ref={isPicking ? pickerRef : undefined}>
                      <button
                        type="button"
                        disabled={isMutating || allTeachers.length === 0}
                        onClick={() => {
                          setPickerQuery("");
                          setPickerState(
                            isPicking ? null : { groupId: group.id, subjectId: member.subjectId },
                          );
                        }}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors
                          ${
                            isPicking
                              ? "bg-violet-100 border-violet-400 text-violet-800"
                              : allTeachers.length === 0
                              ? "bg-white border-line text-slate/40 cursor-not-allowed"
                              : "bg-white border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400"
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <Plus className="h-3 w-3" />
                        {isMutating
                          ? "Saving…"
                          : allTeachers.length === 0
                          ? "No teachers registered"
                          : "Add teacher"}
                      </button>

                      {isPicking && (
                        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-line rounded-xl shadow-lg w-64 overflow-hidden">
                          <div className="p-2 border-b border-line">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search teachers…"
                              value={pickerQuery}
                              onChange={(e) => setPickerQuery(e.target.value)}
                              className={`${inputClass} text-xs py-1 w-full`}
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y divide-line">
                            {filtered.length === 0 ? (
                              <p className="px-3 py-3 text-xs text-slate/60 text-center">
                                {pickerQuery ? "No matches" : "All teachers already assigned"}
                              </p>
                            ) : (
                              filtered.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={async () => {
                                    setPickerState(null);
                                    await onAddTeacher(group.id, member.subjectId, t.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-violet-50 transition-colors"
                                >
                                  <User className="h-3 w-3 text-slate/40 shrink-0" />
                                  <span className="text-xs text-ink flex-1">{t.fullName}</span>
                                  {linkedIds.has(t.id) && (
                                    <span className="text-[10px] text-teal font-medium shrink-0">
                                      linked
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClassProfilePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);

  const [data, setData]             = useState<PageData | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, "CORE" | "ELECTIVE">>({});
  const [dirty, setDirty]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  // Teacher mutation state — tracks in-flight per (groupId:subjectId)
  const [mutating, setMutating]     = useState<Record<string, boolean>>({});
  const [mutateError, setMutateError] = useState<string | null>(null);

  const [allTeachers, setAllTeachers] = useState<StaffTeacher[]>([]);
  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState<"" | "CORE" | "ELECTIVE">("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [profileRes, staffRes] = await Promise.all([
        fetch(`/api/class-profiles/${classId}`),
        fetch("/api/staff"),
      ]);
      if (!profileRes.ok) {
        const body = await profileRes.json().catch(() => ({}));
        setLoadError(body.error ?? "Failed to load class profile.");
        return;
      }
      const fresh: PageData = await profileRes.json();
      setData(fresh);
      const init: Record<string, "CORE" | "ELECTIVE"> = {};
      for (const s of fresh.subjects) init[s.id] = s.effectiveType;
      setAssignments(init);
      setDirty(false);
      if (staffRes.ok) {
        const staffData: StaffTeacher[] = await staffRes.json();
        setAllTeachers(staffData.filter((t) => t.teacherSubjects.length > 0));
      }
    } catch {
      setLoadError("Could not load class profile.");
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  function handleTypeChange(subjectId: string, type: "CORE" | "ELECTIVE") {
    setAssignments((prev) => ({ ...prev, [subjectId]: type }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true); setSaveError(null); setSaved(false);
    const toSend = data.subjects
      .filter((s) => {
        const chosen = assignments[s.id] ?? s.effectiveType;
        return chosen !== s.globalType;
      })
      .map((s) => ({ subjectId: s.id, type: assignments[s.id] ?? s.effectiveType }));
    if (toSend.length === 0) { setDirty(false); setSaved(true); setSaving(false); return; }
    const res = await fetch(`/api/class-profiles/${classId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: toSend }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Couldn't save. Please try again.");
    } else {
      setDirty(false); setSaved(true);
      load();
    }
    setSaving(false);
  }

  async function handleAddTeacher(groupId: string, subjectId: string, teacherId: string) {
    const key = `${groupId}:${subjectId}`;
    setMutating((p) => ({ ...p, [key]: true }));
    setMutateError(null);
    try {
      const res = await fetch(`/api/class-profiles/${classId}/elective-teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, subjectId, teacherId }),
      });
      const body = await res.json();
      if (!res.ok) { setMutateError(body.error ?? "Failed to add teacher."); return; }
      // Patch local state without full reload
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          electiveGroups: prev.electiveGroups.map((g) =>
            g.id !== groupId
              ? g
              : { ...g, classTeachers: [...g.classTeachers, body.pairing] },
          ),
        };
      });
    } finally {
      setMutating((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleRemoveTeacher(groupId: string, subjectId: string, teacherId: string) {
    const key = `${groupId}:${subjectId}`;
    setMutating((p) => ({ ...p, [key]: true }));
    setMutateError(null);
    try {
      const res = await fetch(`/api/class-profiles/${classId}/elective-teachers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, subjectId, teacherId }),
      });
      if (!res.ok) {
        const body = await res.json();
        setMutateError(body.error ?? "Failed to remove teacher.");
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          electiveGroups: prev.electiveGroups.map((g) =>
            g.id !== groupId
              ? g
              : {
                  ...g,
                  classTeachers: g.classTeachers.filter(
                    (t) => !(t.subjectId === subjectId && t.teacherId === teacherId),
                  ),
                },
          ),
        };
      });
    } finally {
      setMutating((p) => ({ ...p, [key]: false }));
    }
  }

  // Subjects absorbed into any elective group — hidden from the ungrouped table
  const groupedSubjectIds = new Set(
    (data?.electiveGroups ?? []).flatMap((g) => g.members.map((m) => m.subjectId)),
  );

  const departments = data
    ? [...new Map(data.subjects.map((s) => [s.department.id, s.department])).values()]
    : [];

  const ungroupedSubjects = (data?.subjects ?? []).filter(
    (s) => !groupedSubjectIds.has(s.id),
  );

  const visibleSubjects = ungroupedSubjects.filter((s) => {
    if (filterDept && s.department.id !== filterDept) return false;
    if (filterType && (assignments[s.id] ?? s.effectiveType) !== filterType) return false;
    return true;
  });

  const coreCount     = ungroupedSubjects.filter((s) => (assignments[s.id] ?? s.effectiveType) === "CORE").length;
  const electiveCount = ungroupedSubjects.filter((s) => (assignments[s.id] ?? s.effectiveType) === "ELECTIVE").length;

  const frameworkLabel: Record<string, string> = {
    EIGHT_FOUR_FOUR: "8-4-4",
    CBC: "CBC",
    CBE: "CBE",
  };

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/departments",    label: "Departments" },
          { href: "/principal/classes",        label: "Classes" },
          { href: "/principal/subjects",       label: "Subjects" },
          { href: "/principal/class-profiles", label: "Class Profiles" },
          { href: "/principal/timetable",      label: "Timetable" },
        ]}
      />

      {loadError ? (
        <div className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
          {loadError}
        </div>
      ) : data === null ? (
        <SkeletonTable rows={6} cols={4} />
      ) : (
        <>
          <PageHeader
            title={data.class.name}
            description={`${frameworkLabel[data.class.frameworkType]} · Form ${data.class.form}${data.class.stream ? ` · ${data.class.stream} stream` : ""}${data.class.classTeacher ? ` · Class teacher: ${data.class.classTeacher.fullName}` : ""}`}
            action={
              <div className="flex items-center gap-2">
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
                <Link
                  href={`/principal/class-profiles/form/${data.class.form}`}
                  className={secondaryButtonClass}
                >
                  <Users className="h-4 w-4" /> View form
                </Link>
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={handleSave}
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            }
          />

          {saveError    && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />}
          {mutateError  && <ErrorBanner message={mutateError} onDismiss={() => setMutateError(null)} />}

          {/* ── Elective groups section ─────────────────────────────── */}
          <ElectiveGroupsClassView
            groups={data.electiveGroups}
            classId={classId}
            allTeachers={allTeachers}
            onAddTeacher={handleAddTeacher}
            onRemoveTeacher={handleRemoveTeacher}
            mutating={mutating}
          />

          {/* ── Ungrouped subjects section ──────────────────────────── */}
          <div className="bg-white border border-line rounded-xl overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-slate/50" />
                <span className="text-sm font-semibold text-ink">Subjects</span>
                <Chip variant="default" size="xs">{coreCount} core</Chip>
                {electiveCount > 0 && (
                  <Chip variant="warn" size="xs">{electiveCount} elective</Chip>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {departments.length > 1 && (
                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="text-xs border border-line rounded-lg px-2 py-1.5 bg-white text-ink focus:outline-none focus:border-teal"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as "" | "CORE" | "ELECTIVE")}
                  className="text-xs border border-line rounded-lg px-2 py-1.5 bg-white text-ink focus:outline-none focus:border-teal"
                >
                  <option value="">All types</option>
                  <option value="CORE">Core</option>
                  <option value="ELECTIVE">Elective</option>
                </select>
              </div>
            </div>

            {visibleSubjects.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <BookOpen className="h-8 w-8 text-slate/25 mx-auto mb-3" />
                <p className="text-sm text-slate">
                  {ungroupedSubjects.length === 0
                    ? "All subjects are in elective groups."
                    : "No subjects match the current filter."}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-paper/60">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide">Subject</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide hidden sm:table-cell">Department</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleSubjects.map((s) => (
                    <tr key={s.id} className="hover:bg-paper/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{s.name}</span>
                          <span className="text-[10px] font-mono text-slate/60 bg-slate-100 px-1.5 py-0.5 rounded hidden xs:inline">
                            {s.code}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate text-xs hidden sm:table-cell">
                        {s.department.name}
                      </td>
                      <td className="px-5 py-3">
                        <TypeToggle
                          subjectId={s.id}
                          value={assignments[s.id] ?? s.effectiveType}
                          onChange={handleTypeChange}
                          hasOverride={(assignments[s.id] ?? s.effectiveType) !== s.globalType}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {dirty && (
              <div className="px-5 py-3 border-t border-line bg-paper/40 flex justify-end">
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
