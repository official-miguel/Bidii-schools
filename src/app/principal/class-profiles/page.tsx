"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PageHeader,
  EmptyState,
  Chip,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import { Users, BookOpen, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ClassProfile = {
  id: string;
  name: string;
  form: number;
  stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBE";
  classTeacher: { id: string; fullName: string } | null;
  _count: { students: number };
  subjectCounts: { core: number; elective: number; total: number };
};

type FormGroup = {
  form: number;
  classes: ClassProfile[];
  totalStudents: number;
  subjectCounts: { core: number; elective: number; total: number };
};

function FrameworkBadge({ type }: { type: string }) {
  if (type === "CBE") return <Chip variant="teal" size="xs">CBE</Chip>;
  return                     <Chip variant="default" size="xs">8-4-4</Chip>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClassProfilesPage() {
  const [profiles, setProfiles] = useState<ClassProfile[] | null>(null);
  const [search,   setSearch]   = useState("");

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/class-profiles");
      const data = res.ok ? await res.json() : [];
      setProfiles(data);
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group profiles by form
  const formGroups: FormGroup[] = (() => {
    if (!profiles) return [];
    const map = new Map<number, ClassProfile[]>();
    for (const p of profiles) {
      if (!map.has(p.form)) map.set(p.form, []);
      map.get(p.form)!.push(p);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([form, classes]) => ({
        form,
        classes,
        totalStudents: classes.reduce((s, c) => s + c._count.students, 0),
        // Subject counts come from the first class in the form (they share the same subjects)
        subjectCounts: classes[0]?.subjectCounts ?? { core: 0, elective: 0, total: 0 },
      }));
  })();

  const visibleGroups = formGroups.filter((g) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      `form ${g.form}`.includes(q) ||
      g.classes.some((c) => c.name.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/departments",    label: "Departments" },
          { href: "/principal/classes",        label: "Classes" },
          { href: "/principal/subjects",       label: "Subjects" },
          { href: "/principal/class-profiles", label: "Class Profiles" },
        ]}
      />

      <PageHeader
        title="Class profiles"
        description="Configure which subjects each form takes as core or elective. Assignments apply to all classes in a form — click a form to manage its subjects."
      />

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search by form or class name…"
        />
        {search && (
          <button
            type="button"
            className="text-sm text-teal hover:underline"
            onClick={() => setSearch("")}
          >
            Clear
          </button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount count={visibleGroups.length} total={formGroups.length} label="form" />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {profiles === null ? (
        <SkeletonTable rows={4} cols={4} />
      ) : profiles.length === 0 ? (
        <EmptyState
          message="No classes found. Add classes first before configuring their subject profiles."
          action={
            <Link
              href="/principal/classes"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal hover:underline"
            >
              <BookOpen className="h-4 w-4" />
              Go to Classes
            </Link>
          }
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState message="No forms match your search." />
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => (
            <Link
              key={group.form}
              href={`/principal/class-profiles/form/${group.form}`}
              className="group block bg-card border border-border rounded-xl overflow-hidden
                         hover:border-teal/50 hover:shadow-sm transition-all duration-150"
            >
              {/* Form header row */}
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal/10 text-teal text-sm font-bold shrink-0">
                    {group.form}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-teal transition-colors">
                      Form {group.form}
                    </p>
                    <p className="text-xs text-slate mt-0.5">
                      {group.classes.length} class{group.classes.length !== 1 ? "es" : ""}
                      {" · "}
                      <span className="tabular-nums">{group.totalStudents}</span> students
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {group.subjectCounts.total === 0 ? (
                    <span className="text-xs text-slate/50 italic hidden sm:block">No subjects assigned</span>
                  ) : (
                    <div className="hidden sm:flex items-center gap-2">
                      <Chip variant="success" size="xs">{group.subjectCounts.core} core</Chip>
                      {group.subjectCounts.elective > 0 && (
                        <Chip variant="warn" size="xs">{group.subjectCounts.elective} elective</Chip>
                      )}
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate/40 group-hover:text-teal transition-colors shrink-0" />
                </div>
              </div>

              {/* Classes within this form — each links to its own class-level profile */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 py-3">
                {group.classes.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/principal/class-profiles/${cls.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 hover:border-teal/50 hover:bg-teal/5 transition-all group/cls"
                  >
                    <FrameworkBadge type={cls.frameworkType} />
                    <span className="text-xs text-slate group-hover/cls:text-teal transition-colors">
                      {cls.name}
                      {cls.stream && (
                        <span className="text-slate/50"> · {cls.stream}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-slate/50">
                      <Users className="h-3 w-3" />
                      {cls._count.students}
                    </span>
                  </Link>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
