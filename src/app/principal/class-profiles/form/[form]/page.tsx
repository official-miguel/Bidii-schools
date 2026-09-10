"use client";

/**
 * /principal/class-profiles/form/[form]
 *
 * Form-level class profile:
 *  • Elective groups read-only summary — shows what groups are defined for
 *    this form and links each class to its individual profile for teacher
 *    assignment. Teacher assignment has moved to the per-class page.
 *  • Subject type (core/elective) bulk editor — applies to ALL classes in
 *    the form at once.
 */

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageHeader,
  EmptyState,
  Chip,
  ErrorBanner,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import {
  CheckCircle2, AlertCircle, Layers,
  ExternalLink, BookOpen, Users, ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ClassInfo = {
  id: string;
  name: string;
  stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBE";
  _count: { students: number };
};

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  globalType: "CORE" | "ELECTIVE";
  effectiveType: "CORE" | "ELECTIVE";
  mixed: boolean;
  classOverrides: Record<string, "CORE" | "ELECTIVE">;
  department: { id: string; name: string };
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
};

type FormData = {
  form: number;
  classes: ClassInfo[];
  subjects: SubjectRow[];
  electiveGroups: ElectiveGroup[];
};

// ── TypeToggle ─────────────────────────────────────────────────────────────

function TypeToggle({
  subjectId, value, onChange, hasOverride,
}: {
  subjectId: string;
  value: "CORE" | "ELECTIVE";
  onChange: (id: string, type: "CORE" | "ELECTIVE") => void;
  hasOverride: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(subjectId, "CORE")}
        className={`text-xs font-medium rounded-l-md border px-3 py-1.5 transition-colors ${
          value === "CORE"
            ? "bg-teal text-white border-teal"
            : "bg-card text-slate border-border hover:bg-slate-50"
        }`}>
        Core
      </button>
      <button type="button" onClick={() => onChange(subjectId, "ELECTIVE")}
        className={`text-xs font-medium rounded-r-md border-t border-b border-r px-3 py-1.5 transition-colors ${
          value === "ELECTIVE"
            ? "bg-amber-500 text-white border-amber-500"
            : "bg-card text-slate border-border hover:bg-slate-50"
        }`}>
        Elective
      </button>
      {hasOverride && (
        <span className="ml-1 text-xs text-teal" title="Overrides the subject's default type">*</span>
      )}
    </div>
  );
}

// ── ElectiveGroupsSummary ──────────────────────────────────────────────────
// Read-only overview of elective groups for this form. Teacher assignment
// happens at the individual class level — each class card links there.

function ElectiveGroupsSummary({
  groups,
  classes,
  formNum,
}: {
  groups: ElectiveGroup[];
  classes: ClassInfo[];
  formNum: number;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-5 py-6 text-center mb-6">
        <Layers className="h-8 w-8 text-violet-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-violet-700">No elective groups for Form {formNum} yet.</p>
        <p className="text-xs text-violet-500 mt-1 max-w-sm mx-auto">
          Create groups in{" "}
          <Link href="/principal/timetable/requirements"
            className="underline hover:text-violet-700 inline-flex items-center gap-0.5">
            Timetable → Requirements <ExternalLink className="h-3 w-3" />
          </Link>
          . They appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-foreground">Elective Groups</span>
        <Chip variant="purple" size="xs">{groups.length}</Chip>
        <Link href="/principal/timetable/requirements"
          className="ml-auto text-xs text-violet-600 hover:underline flex items-center gap-1">
          Manage groups <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-4 py-2.5 flex gap-2 text-xs text-violet-700">
        <Layers className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-400" />
        <span>
          Teacher assignment for elective subjects is done <strong>per class</strong>.
          Click any class below to assign teachers for each subject in its groups.
        </span>
      </div>

      {/* Group cards */}
      {groups.map((group) => {
        const streamLabel = group.scopeStreams.length > 0
          ? group.scopeStreams.join(", ")
          : "all streams";
        // Which classes in this form are in scope for this group
        const scopedClasses = classes.filter((cls) => {
          if (group.scopeStreams.length === 0) return true;
          if (!cls.stream) return false;
          return group.scopeStreams.some(
            (s) => s.toLowerCase() === cls.stream!.toLowerCase(),
          );
        });

        return (
          <div key={group.id}
            className="rounded-xl border border-violet-200 bg-card overflow-hidden shadow-xs">
            {/* Group header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-violet-50/60 border-b border-violet-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 shrink-0">
                <Layers className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <span className="text-sm font-semibold text-foreground flex-1">{group.name}</span>
              <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium border border-violet-200">
                {group.lessonsPerWeek} lessons/wk
              </span>
              <span className="text-[10px] text-slate/60 shrink-0 hidden sm:block">
                {group.scopeForm > 0 ? `Form ${group.scopeForm} · ` : ""}{streamLabel}
              </span>
            </div>

            {/* Subject pills */}
            <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-violet-50">
              {group.members.length === 0 ? (
                <span className="text-xs text-slate/50 italic">No subjects yet.</span>
              ) : (
                group.members.map((m) => (
                  <span key={m.subjectId}
                    className="inline-flex items-center gap-1 text-[11px] font-medium bg-violet-50 border border-violet-200 text-violet-700 rounded-full px-2 py-0.5">
                    <BookOpen className="h-2.5 w-2.5" />
                    {m.subject.name}
                  </span>
                ))
              )}
            </div>

            {/* Per-class links */}
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate mb-2">
                Assign teachers per class
              </p>
              <div className="flex flex-wrap gap-2">
                {scopedClasses.map((cls) => (
                  <Link key={cls.id}
                    href={`/principal/class-profiles/${cls.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-100 hover:border-violet-300 transition-colors group/link">
                    <Users className="h-3 w-3 shrink-0" />
                    {cls.name}
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FormClassProfilePage({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const { form: formParam } = use(params);
  const router = useRouter();

  const [data, setData]             = useState<FormData | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, "CORE" | "ELECTIVE">>({});
  const [dirty, setDirty]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState<"" | "CORE" | "ELECTIVE">("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/class-profiles/form/${formParam}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error ?? "Failed to load form profile.");
        return;
      }
      const fresh: FormData = await res.json();
      setData(fresh);
      const init: Record<string, "CORE" | "ELECTIVE"> = {};
      for (const s of fresh.subjects) init[s.id] = s.effectiveType;
      setAssignments(init);
      setDirty(false);
    } catch {
      setLoadError("Could not load form profile.");
    }
  }, [formParam]);

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
        return chosen !== s.globalType || s.mixed || Object.keys(s.classOverrides).length > 0;
      })
      .map((s) => ({ subjectId: s.id, type: assignments[s.id] ?? s.effectiveType }));

    if (toSend.length === 0) { setDirty(false); setSaved(true); setSaving(false); return; }

    const res = await fetch(`/api/class-profiles/form/${formParam}`, {
      method: "PUT",
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

  // Subjects absorbed into any group — excluded from the type-toggle table
  const groupedSubjectIds = new Set(
    (data?.electiveGroups ?? []).flatMap((g) => g.members.map((m) => m.subjectId)),
  );

  const departments = data
    ? [...new Map(data.subjects.map((s) => [s.department.id, s.department])).values()]
    : [];

  const ungroupedSubjects = (data?.subjects ?? []).filter((s) => !groupedSubjectIds.has(s.id));

  const visibleSubjects = ungroupedSubjects.filter((s) => {
    if (filterDept && s.department.id !== filterDept) return false;
    if (filterType && (assignments[s.id] ?? s.effectiveType) !== filterType) return false;
    return true;
  });

  const coreCount = ungroupedSubjects.filter(
    (s) => (assignments[s.id] ?? s.effectiveType) === "CORE",
  ).length;
  const electiveCount = ungroupedSubjects.filter(
    (s) => (assignments[s.id] ?? s.effectiveType) === "ELECTIVE",
  ).length;

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
            title={`Form ${data.form} — Subject Profile`}
            description={`Configure core/elective type for all ${data.classes.length} class${data.classes.length !== 1 ? "es" : ""} in this form. Teacher assignment for elective groups is done per class.`}
            action={
              <div className="flex items-center gap-2">
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />Saved
                  </span>
                )}
                <button type="button" className={secondaryButtonClass}
                  onClick={() => router.push("/principal/class-profiles")}>
                  Back
                </button>
                <button type="button" className={primaryButtonClass}
                  onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            }
          />

          {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />}

          {/* Classes row */}
          <div className="mb-5 flex flex-wrap gap-2">
            {data.classes.map((cls) => (
              <Link key={cls.id}
                href={`/principal/class-profiles/${cls.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-teal/50 hover:text-teal transition-colors">
                <span className="font-medium">{cls.name}</span>
                {cls.stream && <span className="text-slate/60">· {cls.stream}</span>}
                <ChevronRight className="h-3 w-3 text-slate/40" />
              </Link>
            ))}
          </div>

          {/* ── Elective groups read-only summary ─────────────────── */}
          <ElectiveGroupsSummary
            groups={data.electiveGroups}
            classes={data.classes}
            formNum={data.form}
          />

          {/* ── Non-grouped subjects type editor ──────────────────── */}
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-foreground">Subjects</span>
            <Chip variant="success" size="xs">{coreCount} core</Chip>
            {electiveCount > 0 && <Chip variant="warn" size="xs">{electiveCount} elective</Chip>}
            {ungroupedSubjects.some((s) => s.mixed) && (
              <span className="flex items-center gap-1 text-xs text-warn">
                <AlertCircle className="h-3.5 w-3.5" />
                Some have mixed types — saving will unify them across the form.
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {departments.length > 1 && (
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
                className="text-sm rounded-lg border border-border px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-teal/30">
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "" | "CORE" | "ELECTIVE")}
              className="text-sm rounded-lg border border-border px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-teal/30">
              <option value="">All types</option>
              <option value="CORE">Core</option>
              <option value="ELECTIVE">Elective</option>
            </select>
            {(filterDept || filterType) && (
              <button type="button" className="text-sm text-teal hover:underline"
                onClick={() => { setFilterDept(""); setFilterType(""); }}>
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-slate">
              {visibleSubjects.length} of {ungroupedSubjects.length} subjects
            </span>
          </div>

          {ungroupedSubjects.length === 0 ? (
            <EmptyState
              message="All subjects for this form are covered by elective groups."
              action={
                <Link href="/principal/subjects"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal hover:underline">
                  Manage subjects
                </Link>
              }
            />
          ) : visibleSubjects.length === 0 ? (
            <EmptyState message="No subjects match the current filters." />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                      <th className="px-5 py-3.5">Subject</th>
                      <th className="px-5 py-3.5 w-[90px]">Code</th>
                      <th className="px-5 py-3.5 hidden md:table-cell">Department</th>
                      <th className="px-5 py-3.5 w-[80px] hidden sm:table-cell">Default</th>
                      <th className="px-5 py-3.5 w-[200px]">Type for Form {data.form}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSubjects.map((s) => {
                      const currentType = assignments[s.id] ?? s.effectiveType;
                      const hasOverride = currentType !== s.globalType;
                      return (
                        <tr key={s.id}
                          className="border-b border-border last:border-0 hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-foreground">{s.name}</span>
                            {s.mixed && (
                              <span className="ml-2 text-xs text-warn"
                                title="Classes in this form have different types — saving will unify them.">
                                (mixed)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-mono text-slate bg-slate-50 border border-border rounded px-1.5 py-0.5">
                              {s.code}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <span className="text-sm text-slate">{s.department.name}</span>
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <Chip variant={s.globalType === "CORE" ? "success" : "warn"} size="xs">
                              {s.globalType === "CORE" ? "Core" : "Elective"}
                            </Chip>
                          </td>
                          <td className="px-5 py-3.5">
                            <TypeToggle subjectId={s.id} value={currentType}
                              onChange={handleTypeChange} hasOverride={hasOverride} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-5 py-3 bg-slate-50/60">
                <p className="text-xs text-slate">
                  <span className="text-teal font-medium">*</span> marks subjects where the
                  form assignment differs from the school-wide default. Changes apply to all{" "}
                  {data.classes.length} class{data.classes.length !== 1 ? "es" : ""} in Form {data.form}.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
