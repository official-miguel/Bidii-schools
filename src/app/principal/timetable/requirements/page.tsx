"use client";

/**
 * /principal/timetable/requirements — Per-Class Lesson Requirements + Elective Groups
 *
 * The right panel now has two sections when a form or class is selected:
 *  1. Elective Groups — created/edited at the top of the panel (form-scoped or school-wide).
 *     A "+ Add Group" button lives above the groups list. Each group card shows its
 *     members with a "×" to remove and a "+" to add more subjects. Subjects absorbed
 *     into a group appear greyed-out (inactive) in the requirements table below.
 *  2. Requirements table — same as before, but grouped subjects are shown as
 *     read-only "In group: X" rows instead of editable frequency inputs.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Save, RefreshCw, ChevronDown, ChevronUp, Wand2, CheckCircle2,
  BookOpen, Users, User, ArrowLeft, Info, Plus, Pencil, Trash2,
  X, Layers, Check,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  PageHeader, ErrorBanner,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";

// ── Types ──────────────────────────────────────────────────────────────────

type SchoolClass = { id: string; name: string; form: number; stream: string | null };

type SubjectMeta = {
  id: string; code: string; name: string; internalCode: number; doubleLesson: boolean;
};

type Requirement = {
  classId: string; subjectId: string; lessonsPerWeek: number;
  subject: SubjectMeta;
  class: { id: string; name: string; form: number; stream: string | null };
};

type DraftEntry = { lessonsPerWeek: number; doublesPerWeek: number };
type Draft = Record<string, DraftEntry>;

type GroupMember = {
  id: string;
  subjectId: string;
  subject: { id: string; code: string; name: string; internalCode: number };
};

type ElectiveGroup = {
  id: string;
  name: string;
  scopeForm: number;
  scopeStreams: string[];
  lessonsPerWeek: number;
  doublesPerWeek: number;
  members: GroupMember[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDraft(reqs: Requirement[]): Draft {
  const d: Draft = {};
  for (const r of reqs) {
    d[r.subjectId] = {
      lessonsPerWeek: r.lessonsPerWeek,
      doublesPerWeek: r.subject.doubleLesson ? 1 : 0,
    };
  }
  return d;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RequirementsPage() {
  const searchParams = useSearchParams();
  const [loading,        setLoading]        = useState(true);
  const [classes,        setClasses]        = useState<SchoolClass[]>([]);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState<string | null>(null);
  const [autoPopulating, setAutoPopulating] = useState(false);

  // selection: null = list view, "form-N" = form bulk editor, classId = stream editor
  const [selection, setSelection] = useState<string | null>(null);

  // per-class requirement cache: classId → Requirement[]
  const [reqCache, setReqCache] = useState<Record<string, Requirement[]>>({});

  // draft for currently editing class / form
  const [draft,    setDraft]   = useState<Draft>({});
  const [saving,   setSaving]  = useState(false);
  const [expanded, setExpanded] = useState(true);

  // ── Elective groups state ────────────────────────────────────────────────
  const [groups,        setGroups]        = useState<ElectiveGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  // which group is being edited (id), or "new" for creation card
  const [editingGroup,  setEditingGroup]  = useState<string | null>(null);
  // draft name/lessonsPerWeek/doublesPerWeek/scopeStreams for the group being created/renamed
  const [groupDraft,    setGroupDraft]    = useState<{ name: string; lessonsPerWeek: number; doublesPerWeek: number; scopeStreams: string[] }>({ name: "", lessonsPerWeek: 3, doublesPerWeek: 0, scopeStreams: [] });
  // subject picker open for which groupId
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // all elective subjects for the school (fetched once)
  const [electiveSubjects, setElectiveSubjects] = useState<Array<{ id: string; name: string; code: string; applicableForms: number[] }>>([]);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const [classRes, subjectRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/subjects"),
      ]);
      const classData = await classRes.json();
      const subjectData = await subjectRes.json();
      const cls: SchoolClass[] = classData?.classes ?? classData ?? [];
      cls.sort((a, b) => a.form - b.form || a.name.localeCompare(b.name));
      setClasses(cls);
      const allSubjects: Array<{ id: string; name: string; code: string; type: string; applicableForms: number[] }> =
        Array.isArray(subjectData) ? subjectData : [];
      setElectiveSubjects(
        allSubjects
          .filter((s) => s.type === "ELECTIVE")
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequirements = useCallback(async (classId: string): Promise<Requirement[]> => {
    if (reqCache[classId]) return reqCache[classId];
    const res  = await fetch(`/api/timetable/lesson-requirements?classId=${encodeURIComponent(classId)}`);
    const data = await res.json();
    const reqs: Requirement[] = data.requirements ?? [];
    setReqCache((prev) => ({ ...prev, [classId]: reqs }));
    return reqs;
  }, [reqCache]);

  const loadGroups = useCallback(async (scopeForm: number) => {
    setGroupsLoading(true);
    try {
      const res  = await fetch(`/api/timetable/elective-groups?scopeForm=${scopeForm}`);
      const data = await res.json();
      setGroups(data.groups ?? []);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Auto-open a specific class when navigated from ConflictPanel via the classId query param
  useEffect(() => {
    const classIdParam = searchParams.get("classId");
    if (!classIdParam || loading || classes.length === 0) return;
    const cls = classes.find((c) => c.id === classIdParam);
    if (cls) openStream(classIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, classes]);

  // Close subject picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerGroupId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Panel open helpers ────────────────────────────────────────────────────

  async function openStream(classId: string) {
    setError(null);
    const cls = classes.find((c) => c.id === classId);
    const reqs = await loadRequirements(classId);
    setDraft(buildDraft(reqs));
    setSelection(classId);
    setExpanded(true);
    setEditingGroup(null);
    setPickerGroupId(null);
    // load groups scoped to this class's form
    if (cls) await loadGroups(cls.form);
  }

  async function openForm(form: number) {
    setError(null);
    const formClasses = classes.filter((c) => c.form === form);
    if (formClasses.length === 0) return;
    const reqs = await loadRequirements(formClasses[0].id);
    setDraft(buildDraft(reqs));
    setSelection(`form-${form}`);
    setExpanded(true);
    setEditingGroup(null);
    setPickerGroupId(null);
    await loadGroups(form);
  }

  // ── Save requirements ─────────────────────────────────────────────────────

  async function saveStream(classId: string) {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const body = Object.entries(draft)
        .filter(([, v]) => v.lessonsPerWeek > 0)
        .map(([subjectId, v]) => ({ subjectId, lessonsPerWeek: v.lessonsPerWeek }));
      const res = await fetch("/api/timetable/lesson-requirements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, requirements: body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      setReqCache((prev) => { const n = { ...prev }; delete n[classId]; return n; });
      setSuccess("Requirements saved.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function saveForm(form: number) {
    setSaving(true); setError(null); setSuccess(null);
    const formClasses = classes.filter((c) => c.form === form);
    try {
      const body = Object.entries(draft)
        .filter(([, v]) => v.lessonsPerWeek > 0)
        .map(([subjectId, v]) => ({ subjectId, lessonsPerWeek: v.lessonsPerWeek }));
      for (const cls of formClasses) {
        const res = await fetch("/api/timetable/lesson-requirements", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: cls.id, requirements: body }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(`Failed on ${cls.name}: ${data.error ?? "Unknown error"}`);
          return;
        }
      }
      setReqCache((prev) => {
        const n = { ...prev }; formClasses.forEach((c) => delete n[c.id]); return n;
      });
      setSuccess(`Requirements applied to all ${formClasses.length} classes in Form ${form}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleAutoPopulate() {
    setAutoPopulating(true); setError(null);
    try {
      const res = await fetch("/api/timetable/lesson-requirements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-populate" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to auto-populate"); return; }
      setReqCache({});
      setSuccess(`Auto-populated ${data.created ?? "all"} requirements.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setAutoPopulating(false); }
  }

  // ── Elective group CRUD ───────────────────────────────────────────────────

  async function createGroup() {
    if (!groupDraft.name.trim()) return;
    const scopeForm = selectionForm ?? 0;
    setError(null);
    const res = await fetch("/api/timetable/elective-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupDraft.name.trim(),
        scopeForm,
        lessonsPerWeek: groupDraft.lessonsPerWeek,
        doublesPerWeek: groupDraft.doublesPerWeek,
        scopeStreams: groupDraft.scopeStreams,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to create group"); return; }
    setGroups((prev) => [...prev, data.group]);
    setEditingGroup(null);
    setGroupDraft({ name: "", lessonsPerWeek: 3, doublesPerWeek: 0, scopeStreams: [] });
  }

  async function saveGroupEdits(group: ElectiveGroup) {
    setError(null);
    const res = await fetch("/api/timetable/elective-groups", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: group.id,
        name: groupDraft.name.trim(),
        lessonsPerWeek: groupDraft.lessonsPerWeek,
        doublesPerWeek: groupDraft.doublesPerWeek,
        scopeStreams: groupDraft.scopeStreams,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to save group"); return; }
    setGroups((prev) => prev.map((g) => g.id === group.id ? data.group : g));
    setEditingGroup(null);
  }

  async function deleteGroup(groupId: string) {
    if (!confirm("Remove this elective group? Subjects will return to individual scheduling.")) return;
    setError(null);
    const res = await fetch("/api/timetable/elective-groups", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: groupId }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to delete group"); return; }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  async function addSubjectToGroup(groupId: string, subjectId: string) {
    setError(null);
    const res = await fetch(`/api/timetable/elective-groups/${groupId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to add subject"); return; }
    setGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, members: [...g.members, data.member] } : g
    ));
    setPickerGroupId(null);
  }

  async function removeSubjectFromGroup(groupId: string, subjectId: string) {
    setError(null);
    const res = await fetch(`/api/timetable/elective-groups/${groupId}/members`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to remove subject"); return; }
    setGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, members: g.members.filter((m) => m.subjectId !== subjectId) } : g
    ));
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const classesByForm = useMemo(() => {
    const map = new Map<number, SchoolClass[]>();
    for (const cls of classes) {
      if (!map.has(cls.form)) map.set(cls.form, []);
      map.get(cls.form)!.push(cls);
    }
    return map;
  }, [classes]);

  // Individual subjects: sum their lessonsPerWeek from draft, excluding absorbed ones
  // Group subjects: each group counts once (its lessonsPerWeek), not once per member
  const totalRequired = useMemo(() => {
    const absorbedIds = new Set(groups.flatMap((g) => g.members.map((m) => m.subjectId)));
    const individualTotal = Object.entries(draft)
      .filter(([subjectId]) => !absorbedIds.has(subjectId))
      .reduce((s, [, v]) => s + v.lessonsPerWeek, 0);
    // Groups with at least one member each count as their lessonsPerWeek once
    const groupTotal = groups
      .filter((g) => g.members.length > 0)
      .reduce((s, g) => s + g.lessonsPerWeek, 0);
    return individualTotal + groupTotal;
  }, [draft, groups]);

  const selectionForm  = selection?.startsWith("form-") ? Number(selection.replace("form-", "")) : null;
  const selectionClass = selection && !selection.startsWith("form-") ? classes.find((c) => c.id === selection) : null;
  const selectionTitle = selectionForm != null
    ? `Form ${selectionForm} — All Streams (bulk)`
    : selectionClass?.name ?? "";

  // Distinct stream names for the currently-selected form, used by GroupEditCard
  const availableStreams = useMemo(() => {
    const form = selectionForm ?? selectionClass?.form;
    if (!form) return [];
    const streams = (classesByForm.get(form) ?? [])
      .map((c) => c.stream)
      .filter((s): s is string => !!s);
    return [...new Set(streams)].sort();
  }, [selectionForm, selectionClass, classesByForm]);

  // Set of subjectIds that are absorbed into any group at this scope
  const absorbedSubjectIds = useMemo(
    () => new Set(groups.flatMap((g) => g.members.map((m) => m.subjectId))),
    [groups]
  );

  const subjectRows = useMemo(() => {
    if (!selection) return [];
    const refClassId = selectionClass?.id
      ?? (selectionForm != null ? (classesByForm.get(selectionForm)?.[0]?.id ?? "") : "");
    const reqs = reqCache[refClassId] ?? [];
    return reqs.map((r) => ({
      subjectId:     r.subjectId,
      subjectName:   r.subject.name,
      subjectCode:   r.subject.code,
      defaultDouble: r.subject.doubleLesson,
    }));
  }, [selection, selectionClass, selectionForm, classesByForm, reqCache]);

  // Elective subjects available to add to a group:
  // - must be type ELECTIVE (already filtered into electiveSubjects)
  // - applicable to the group's form scope (or school-wide group accepts all)
  // - not already a member of this group
  function availableForGroup(groupId: string): Array<{ id: string; name: string; code: string }> {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    const inGroup = new Set(group.members.map((m) => m.subjectId));
    return electiveSubjects.filter((s) => {
      if (inGroup.has(s.id)) return false;
      // For form-scoped groups, only show subjects applicable to that form
      if (group.scopeForm > 0 && (s.applicableForms?.length ?? 0) > 0) {
        return s.applicableForms!.includes(group.scopeForm);
      }
      return true;
    });
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <ContextNavigation items={TIMETABLE_NAV} />
        <PageHeader title="Timetable" description="Set lesson requirements per class." />
        <div className="mt-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-white border border-line rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <PageHeader
        title="Timetable"
        description="Set how many lessons per week each class needs per subject. Click a Form to bulk-edit all its streams, or click a specific class to configure it individually."
      />

      <div className="space-y-5">
        {error   && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="rounded-xl border border-success/20 bg-success-bg p-4 text-sm text-success font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{success}
          </div>
        )}

        {/* ── Top bar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate">
            Requirements differ per class — 8-4-4, CBC, and CBE have different lesson counts.
          </p>
          <button type="button" onClick={handleAutoPopulate} disabled={autoPopulating}
            className={secondaryButtonClass}
            title="Set the number of lessons per week for every subject that already has a teacher assigned to a class, distributing the available weekly slots evenly across those subjects.">
            {autoPopulating
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Auto-populating…</>
              : <><Wand2 className="h-4 w-4" />Auto-populate from subjects</>}
          </button>
        </div>
        {/* Auto-populate explanation */}
        <div className="rounded-lg border border-line bg-paper px-4 py-2.5 flex gap-2 text-xs text-slate">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate/60" />
          <span>
            <strong className="text-ink">Auto-populate</strong> sets the lesson frequency for subjects that already have a
            teacher assigned to each class. It distributes the available weekly slots (lesson columns × operating days)
            evenly across those teacher-assigned subjects so the totals fill the timetable.
            Double-lesson subjects receive twice the allocation. Subjects without a teacher are not touched.
            Existing requirements are never overwritten.
          </span>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center">
            <BookOpen className="h-10 w-10 text-slate/30 mx-auto mb-3" />
            <p className="text-sm text-slate">No classes found. Register classes first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5 items-start">

            {/* ── Sidebar ────────────────────────────────────────────── */}
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <p className="text-xs font-semibold text-slate uppercase tracking-wide">Forms &amp; Classes</p>
                <p className="text-[10px] text-slate mt-0.5">Click a form to bulk-edit all its streams</p>
              </div>
              <div className="divide-y divide-line">
                {Array.from(classesByForm.entries()).map(([form, formClasses]) => {
                  const formKey    = `form-${form}`;
                  const formActive = selection === formKey;
                  return (
                    <div key={form}>
                      <button type="button" onClick={() => openForm(form)}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors group
                          ${formActive ? "bg-teal/10 border-l-2 border-teal" : "bg-paper hover:bg-teal/5 border-l-2 border-transparent"}`}>
                        <Users className={`h-3.5 w-3.5 shrink-0 ${formActive ? "text-teal" : "text-slate group-hover:text-teal"}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wide flex-1 ${formActive ? "text-teal" : "text-slate group-hover:text-teal"}`}>
                          Form {form}
                        </span>
                        <span className="text-[10px] text-slate/60 bg-line px-1.5 py-0.5 rounded-full">
                          {formClasses.length} class{formClasses.length !== 1 ? "es" : ""}
                        </span>
                      </button>
                      {formClasses.map((cls) => {
                        const active = selection === cls.id;
                        return (
                          <button key={cls.id} type="button" onClick={() => openStream(cls.id)}
                            className={`w-full flex items-center gap-2 px-4 pl-8 py-2.5 text-sm transition-colors group
                              ${active ? "bg-teal/10 text-teal font-medium border-l-2 border-teal" : "text-ink hover:bg-teal/5 border-l-2 border-transparent"}`}>
                            <User className={`h-3 w-3 shrink-0 ${active ? "text-teal" : "text-slate/60 group-hover:text-teal"}`} />
                            <span className="flex-1 truncate">{cls.name}</span>
                            {cls.stream && <span className="text-[10px] text-slate/50 shrink-0">{cls.stream}</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right panel ────────────────────────────────────────── */}
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {!selection ? (
                <div className="px-6 py-16 text-center">
                  <BookOpen className="h-10 w-10 text-slate/25 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate">Nothing selected</p>
                  <p className="text-xs text-slate/60 mt-1 max-w-xs mx-auto">
                    Click a <strong>Form</strong> in the sidebar to set requirements for all its
                    streams at once, or click a specific class to configure it individually.
                  </p>
                </div>
              ) : (
                <>
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-line cursor-pointer"
                    onClick={() => setExpanded((e) => !e)}>
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                        ${selectionForm != null ? "bg-teal/10 text-teal" : "bg-blue-50 text-blue-600"}`}>
                        {selectionForm != null ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-ink truncate">{selectionTitle}</h2>
                        <p className="text-xs text-slate mt-0.5">
                          {selectionForm != null
                            ? `Sets requirements for all ${classesByForm.get(selectionForm)?.length ?? 0} streams in Form ${selectionForm}`
                            : (() => {
                                // Count: individual non-absorbed subjects + groups (as 1 each)
                                const absorbedIds = new Set(groups.flatMap((g) => g.members.map((m) => m.subjectId)));
                                const indivCount = Object.keys(draft).filter((id) => !absorbedIds.has(id)).length;
                                const groupCount = groups.filter((g) => g.members.length > 0).length;
                                const subjectCount = indivCount + groupCount;
                                return `${subjectCount} subject${subjectCount !== 1 ? "s" : ""} · ${totalRequired} lessons/week total`;
                              })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {selectionForm != null && (
                        <span className="text-[10px] font-semibold bg-teal/10 text-teal px-2 py-1 rounded-full border border-teal/20">
                          Bulk edit
                        </span>
                      )}
                      {expanded ? <ChevronUp className="h-4 w-4 text-slate" /> : <ChevronDown className="h-4 w-4 text-slate" />}
                    </div>
                  </div>

                  {selectionForm != null && expanded && (
                    <div className="mx-5 mt-4 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3 flex gap-2 text-xs text-teal/90">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Changes here will overwrite requirements for <strong>all streams</strong> in Form {selectionForm}.
                        To tweak a single stream, click it in the sidebar instead.
                      </span>
                    </div>
                  )}

                  {expanded && (
                    <>
                      {/* ── ELECTIVE GROUPS SECTION ─────────────────── */}
                      <ElectiveGroupsSection
                        groups={groups}
                        groupsLoading={groupsLoading}
                        editingGroup={editingGroup}
                        groupDraft={groupDraft}
                        pickerGroupId={pickerGroupId}
                        pickerRef={pickerRef}
                        availableForGroup={availableForGroup}
                        availableStreams={availableStreams}
                        onStartCreate={() => {
                          setEditingGroup("new");
                          setGroupDraft({ name: "", lessonsPerWeek: 3, doublesPerWeek: 0, scopeStreams: [] });
                        }}
                        onCancelEdit={() => { setEditingGroup(null); setPickerGroupId(null); }}
                        onGroupDraftChange={setGroupDraft}
                        onCreateGroup={createGroup}
                        onStartEdit={(g) => { setEditingGroup(g.id); setGroupDraft({ name: g.name, lessonsPerWeek: g.lessonsPerWeek, doublesPerWeek: g.doublesPerWeek ?? 0, scopeStreams: g.scopeStreams ?? [] }); }}
                        onSaveEdits={saveGroupEdits}
                        onDeleteGroup={deleteGroup}
                        onAddSubject={addSubjectToGroup}
                        onRemoveSubject={removeSubjectFromGroup}
                        onTogglePicker={(gid) => setPickerGroupId((prev) => prev === gid ? null : gid)}
                      />

                      {/* ── REQUIREMENTS TABLE ──────────────────────── */}
                      {subjectRows.length === 0 ? (
                        <div className="px-5 py-10 text-center border-t border-line">
                          <BookOpen className="h-8 w-8 text-slate/30 mx-auto mb-3" />
                          <p className="text-sm text-slate">No requirements yet.</p>
                          <p className="text-xs text-slate/60 mt-1 mb-4">
                            Assign teachers to subjects for this class, then click &quot;Auto-populate from subjects&quot; to set lesson frequencies.
                          </p>
                        </div>
                      ) : (
                        <RequirementsTable
                          rows={subjectRows}
                          draft={draft}
                          absorbedSubjectIds={absorbedSubjectIds}
                          groups={groups}
                          onChange={(subjectId, patch) =>
                            setDraft((prev) => ({
                              ...prev,
                              [subjectId]: { ...(prev[subjectId] ?? { lessonsPerWeek: 0, doublesPerWeek: 0 }), ...patch },
                            }))
                          }
                        />
                      )}

                      {subjectRows.length > 0 && (
                        <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-xs text-slate">
                            Total: <strong className="text-ink">{totalRequired} lessons/week</strong>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setSelection(null)}
                              className={`${secondaryButtonClass} text-xs`}>
                              <ArrowLeft className="h-3.5 w-3.5" /> Back
                            </button>
                            <button type="button" disabled={saving}
                              onClick={() => selectionForm != null ? saveForm(selectionForm) : saveStream(selection!)}
                              className={primaryButtonClass}>
                              {saving
                                ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
                                : <><Save className="h-4 w-4" />
                                    {selectionForm != null
                                      ? `Apply to all Form ${selectionForm} streams`
                                      : "Save requirements"}
                                  </>}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── ElectiveGroupsSection ─────────────────────────────────────────────────

type ElectiveGroupsSectionProps = {
  groups: ElectiveGroup[];
  groupsLoading: boolean;
  editingGroup: string | null;
  groupDraft: { name: string; lessonsPerWeek: number; doublesPerWeek: number; scopeStreams: string[] };
  pickerGroupId: string | null;
  pickerRef: React.RefObject<HTMLDivElement>;
  availableForGroup: (groupId: string) => Array<{ id: string; name: string; code: string }>;
  availableStreams: string[];
  onStartCreate: () => void;
  onCancelEdit: () => void;
  onGroupDraftChange: (d: { name: string; lessonsPerWeek: number; doublesPerWeek: number; scopeStreams: string[] }) => void;
  onCreateGroup: () => void;
  onStartEdit: (g: ElectiveGroup) => void;
  onSaveEdits: (g: ElectiveGroup) => void;
  onDeleteGroup: (id: string) => void;
  onAddSubject: (groupId: string, subjectId: string) => void;
  onRemoveSubject: (groupId: string, subjectId: string) => void;
  onTogglePicker: (groupId: string) => void;
};

function ElectiveGroupsSection({
  groups, groupsLoading, editingGroup, groupDraft, pickerGroupId, pickerRef,
  availableForGroup, availableStreams, onStartCreate, onCancelEdit, onGroupDraftChange,
  onCreateGroup, onStartEdit, onSaveEdits, onDeleteGroup,
  onAddSubject, onRemoveSubject, onTogglePicker,
}: ElectiveGroupsSectionProps) {
  const [pickerQuery, setPickerQuery] = useState("");

  return (
    <div className="border-b border-line">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3 bg-paper border-b border-line">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          <span className="text-xs font-semibold text-ink">Elective Groups</span>
          {groups.length > 0 && (
            <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
              {groups.length}
            </span>
          )}
        </div>
        {editingGroup !== "new" && (
          <button type="button" onClick={onStartCreate}
            className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors">
            <Plus className="h-3.5 w-3.5" />Add Group
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {groupsLoading && (
          <div className="h-10 rounded-lg bg-line animate-pulse" />
        )}

        {/* Create card */}
        {editingGroup === "new" && (
          <GroupEditCard
            draft={groupDraft}
            isNew
            availableStreams={availableStreams}
            onChange={onGroupDraftChange}
            onSave={onCreateGroup}
            onCancel={onCancelEdit}
          />
        )}

        {/* Existing group cards */}
        {groups.map((group) => {
          const isEditing = editingGroup === group.id;
          const available = availableForGroup(group.id);
          const filtered  = available.filter((s) =>
            pickerQuery === "" ||
            s.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
            s.code.toLowerCase().includes(pickerQuery.toLowerCase())
          );

          return (
            <div key={group.id}
              className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">

              {/* Group header row */}
              {isEditing ? (
                <div className="p-3">
                  <GroupEditCard
                    draft={groupDraft}
                    isNew={false}
                    availableStreams={availableStreams}
                    onChange={onGroupDraftChange}
                    onSave={() => onSaveEdits(group)}
                    onCancel={onCancelEdit}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <Layers className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  <span className="text-sm font-semibold text-ink flex-1">{group.name}</span>
                  {group.scopeStreams.length > 0 && (
                    <span className="text-[10px] text-slate/60 shrink-0 hidden sm:inline">
                      {group.scopeStreams.join(", ")}
                    </span>
                  )}
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                    {group.lessonsPerWeek}/wk{(group.doublesPerWeek ?? 0) > 0 ? ` · ${group.doublesPerWeek}×2` : ""}
                  </span>
                  <button type="button" title="Edit group"
                    onClick={() => onStartEdit(group)}
                    className="p-1 rounded hover:bg-violet-100 text-slate hover:text-violet-700 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button type="button" title="Delete group"
                    onClick={() => onDeleteGroup(group.id)}
                    className="p-1 rounded hover:bg-red-50 text-slate hover:text-red-500 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Members list */}
              {!isEditing && (
                <div className="px-3 pb-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {group.members.length === 0 && (
                      <span className="text-[11px] text-slate/50 italic">No subjects yet — add one below.</span>
                    )}
                    {group.members.map((m) => (
                      <span key={m.id}
                        className="inline-flex items-center gap-1 bg-white border border-violet-200 text-violet-800 text-[11px] font-medium px-2 py-0.5 rounded-full">
                        {m.subject.name}
                        <button type="button" onClick={() => onRemoveSubject(group.id, m.subjectId)}
                          className="ml-0.5 hover:text-red-500 transition-colors">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add subject trigger + dropdown */}
                  <div className="relative" ref={pickerGroupId === group.id ? pickerRef : undefined}>
                    <button type="button"
                      onClick={() => { setPickerQuery(""); onTogglePicker(group.id); }}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                        ${pickerGroupId === group.id
                          ? "bg-violet-100 border-violet-400 text-violet-800"
                          : "bg-white border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400"
                        }`}>
                      <Plus className="h-3.5 w-3.5" />
                      Add subject
                    </button>

                    {pickerGroupId === group.id && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-line rounded-xl shadow-lg w-64 overflow-hidden">
                        <div className="p-2 border-b border-line">
                          <input autoFocus type="text" placeholder="Search elective subjects…"
                            value={pickerQuery}
                            onChange={(e) => setPickerQuery(e.target.value)}
                            className={`${inputClass} text-xs py-1.5 w-full`} />
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y divide-line">
                          {filtered.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-slate/60 text-center">
                              {available.length === 0
                                ? "All eligible elective subjects are already in this group"
                                : "No matches"}
                            </p>
                          ) : (
                            filtered.map((s) => (
                              <button key={s.id} type="button"
                                onClick={() => onAddSubject(group.id, s.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-50 transition-colors">
                                <span className="text-xs font-medium text-ink flex-1">{s.name}</span>
                                <span className="text-[10px] text-slate font-mono bg-line px-1.5 py-0.5 rounded">{s.code}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!groupsLoading && groups.length === 0 && editingGroup !== "new" && (
          <p className="text-xs text-slate/50 text-center py-2">
            No elective groups yet. Add one to synchronise electives across classes.
          </p>
        )}
      </div>
    </div>
  );
}

// ── GroupEditCard — inline create / rename form ───────────────────────────

function GroupEditCard({
  draft, isNew, onChange, onSave, onCancel, availableStreams,
}: {
  draft: { name: string; lessonsPerWeek: number; doublesPerWeek: number; scopeStreams: string[] };
  isNew: boolean;
  availableStreams: string[];
  onChange: (d: { name: string; lessonsPerWeek: number; doublesPerWeek: number; scopeStreams: string[] }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = draft.name.trim().length > 0 && draft.lessonsPerWeek >= 1;

  function toggleStream(stream: string) {
    const already = draft.scopeStreams.includes(stream);
    onChange({
      ...draft,
      scopeStreams: already
        ? draft.scopeStreams.filter((s) => s !== stream)
        : [...draft.scopeStreams, stream],
    });
  }

  return (
    <div className="rounded-xl border border-violet-300 bg-white p-3 space-y-3">
      <p className="text-xs font-semibold text-violet-700">{isNew ? "New elective group" : "Edit group"}</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">
            Group name
          </label>
          <input
            autoFocus
            type="text"
            placeholder="e.g. GPC, Sciences…"
            maxLength={50}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) onSave(); }}
            className={`${inputClass} text-sm py-1.5 w-full`}
          />
        </div>
        <div className="w-20">
          <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">
            Lessons / wk
          </label>
          <input
            type="number" min={1} max={20}
            value={draft.lessonsPerWeek}
            onChange={(e) => onChange({ ...draft, lessonsPerWeek: Number(e.target.value) })}
            className={`${inputClass} text-sm py-1.5 text-center w-full`}
          />
        </div>
        <div className="w-20">
          <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1">
            Doubles / wk
          </label>
          <input
            type="number" min={0} max={10}
            value={draft.doublesPerWeek}
            title="How many of those lessons should be consecutive double-lesson blocks (0 = all singles)"
            onChange={(e) => onChange({ ...draft, doublesPerWeek: Number(e.target.value) })}
            className={`${inputClass} text-sm py-1.5 text-center w-full${draft.doublesPerWeek > 0 ? " border-teal/40 bg-teal/5" : ""}`}
          />
        </div>
      </div>

      {/* Stream scope — only shown when there are multiple streams to pick from */}
      {availableStreams.length > 1 && (
        <div>
          <label className="text-[10px] font-medium text-slate uppercase tracking-wide block mb-1.5">
            Applies to streams
            <span className="ml-1 normal-case text-slate/50 font-normal">(leave all unselected = every stream)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {availableStreams.map((s) => {
              const active = draft.scopeStreams.includes(s);
              return (
                <button key={s} type="button"
                  onClick={() => toggleStream(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    active
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate border-line hover:border-violet-400 hover:text-violet-700"
                  }`}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${secondaryButtonClass} text-xs`}>
          Cancel
        </button>
        <button type="button" disabled={!canSave} onClick={onSave}
          className={`${primaryButtonClass} text-xs ${!canSave ? "opacity-50 cursor-not-allowed" : ""}`}>
          <Check className="h-3.5 w-3.5" />
          {isNew ? "Create group" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── RequirementsTable ─────────────────────────────────────────────────────

function RequirementsTable({
  rows, draft, absorbedSubjectIds, groups, onChange,
}: {
  rows: Array<{ subjectId: string; subjectName: string; subjectCode: string; defaultDouble: boolean }>;
  draft: Draft;
  absorbedSubjectIds: Set<string>;
  groups: ElectiveGroup[];
  onChange: (subjectId: string, patch: Partial<DraftEntry>) => void;
}) {
  // Build a lookup: subjectId → group name(s) it belongs to
  const subjectGroupNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of groups) {
      for (const m of g.members) {
        if (!map.has(m.subjectId)) map.set(m.subjectId, []);
        map.get(m.subjectId)!.push(g.name);
      }
    }
    return map;
  }, [groups]);

  return (
    <div className="divide-y divide-line">
      {/* Column header */}
      <div className="grid grid-cols-[1fr_72px_80px_110px_110px] gap-2 px-5 py-2 bg-paper">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Subject</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate text-center">Code</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate text-center">Default</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate text-center">Lessons / wk</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate text-center">Doubles / wk</span>
      </div>

      {rows.map((row) => {
        const absorbed = absorbedSubjectIds.has(row.subjectId);
        const groupNames = subjectGroupNames.get(row.subjectId) ?? [];
        const entry = draft[row.subjectId] ?? { lessonsPerWeek: 0, doublesPerWeek: 0 };

        if (absorbed) {
          // Read-only absorbed row
          return (
            <div key={row.subjectId}
              className="grid grid-cols-[1fr_72px_80px_110px_110px] gap-2 px-5 py-2.5 items-center opacity-50 bg-paper/50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-slate font-medium truncate">{row.subjectName}</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium shrink-0 border border-violet-200">
                  <Layers className="h-2.5 w-2.5" />
                  {groupNames.join(", ")}
                </span>
              </div>
              <span className="text-xs text-slate/60 text-center font-mono">{row.subjectCode}</span>
              <span className="text-center">
                {row.defaultDouble
                  ? <span className="text-xs bg-line text-slate/50 px-2 py-0.5 rounded-full">2x</span>
                  : <span className="text-xs text-slate/30">—</span>}
              </span>
              <div className="flex items-center justify-center">
                <span className="text-xs text-slate/50 italic">via group</span>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-xs text-slate/40">—</span>
              </div>
            </div>
          );
        }

        // Active editable row
        return (
          <div key={row.subjectId}
            className="grid grid-cols-[1fr_72px_80px_110px_110px] gap-2 px-5 py-2.5 items-center">
            <span className="text-sm text-ink font-medium truncate">{row.subjectName}</span>
            <span className="text-xs text-slate text-center font-mono">{row.subjectCode}</span>
            <span className="text-center">
              {row.defaultDouble
                ? <span className="text-xs bg-teal/10 text-teal px-2 py-0.5 rounded-full font-medium">2x</span>
                : <span className="text-xs text-slate/40">—</span>}
            </span>
            <div className="flex items-center justify-center gap-1">
              <input type="number" min={0} max={20}
                value={entry.lessonsPerWeek}
                onChange={(e) => onChange(row.subjectId, { lessonsPerWeek: Number(e.target.value) })}
                className={`${inputClass} w-14 text-center text-sm py-1.5`} />
              <span className="text-xs text-slate shrink-0">/ wk</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <input type="number" min={0} max={10}
                value={entry.doublesPerWeek}
                title="How many double-lesson blocks this subject has per week"
                onChange={(e) => onChange(row.subjectId, { doublesPerWeek: Number(e.target.value) })}
                className={`${inputClass} w-14 text-center text-sm py-1.5
                  ${entry.doublesPerWeek > 0 ? "border-teal/40 bg-teal/5" : ""}`} />
              <span className="text-xs text-slate shrink-0">dbl</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
