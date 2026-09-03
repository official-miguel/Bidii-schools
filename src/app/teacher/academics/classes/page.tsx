"use client";

/**
 * /teacher/academics/classes
 *
 * Read-only class list for teachers and class teachers.
 * - All teachers see every class (view-only).
 * - If the signed-in teacher is a class teacher their class is highlighted with
 *   a teal "Your class" badge and pinned to the top of the list.
 * - Class teachers can open their own class to assign subject teachers via the
 *   ClassWorkspaceDrawer (the drawer checks basePath and renders assign controls).
 * - Subject teachers can open any class as a read-only workspace to browse
 *   enrolled students and subject-teacher mappings.
 */

import { useEffect, useState, useCallback } from "react";
import {
  PageHeader, EmptyState, Chip,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";
import ClassWorkspaceDrawer from "@/components/entity-drawers/ClassWorkspaceDrawer";
import StaffProfileDrawer from "@/components/entity-drawers/StaffProfileDrawer";
import SubjectWorkspaceDrawer from "@/components/entity-drawers/SubjectWorkspaceDrawer";
import DepartmentWorkspaceDrawer from "@/components/entity-drawers/DepartmentWorkspaceDrawer";
import { ExternalLink, Users, Star } from "lucide-react";

// ── Nav (shared across teacher academics sub-pages) ─ imported from lib ──

// ── Types ─────────────────────────────────────────────────────────────────
type Teacher = { id: string; fullName: string };
type SchoolClass = {
  id: string; name: string; form: number; stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE";
  classTeacher: Teacher | null;
  _count: { students: number };
};

type TeacherContext = {
  teacherId: string | null;
  classTeacherOf: { id: string; name: string } | null;
  isClassTeacher: boolean;
  isSubjectTeacher: boolean;
};

function FrameworkBadge({ type }: { type: string }) {
  if (type === "CBE")  return <Chip variant="purple" size="xs">CBE</Chip>;
  if (type === "CBC")  return <Chip variant="teal"   size="xs">CBC</Chip>;
  return                      <Chip variant="default" size="xs">8-4-4</Chip>;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function TeacherClassesPage() {
  const [classes,  setClasses]  = useState<SchoolClass[] | null>(null);
  const [ctx,      setCtx]      = useState<TeacherContext>({ teacherId: null, classTeacherOf: null, isClassTeacher: false, isSubjectTeacher: false });
  const [filterForm,      setFilterForm]      = useState("");
  const [filterFramework, setFilterFramework] = useState("");

  // Drawer state
  const [drawerClassId, setDrawerClassId] = useState<string | null>(null);
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null);
  const [drawerSubjId,  setDrawerSubjId]  = useState<string | null>(null);
  const [drawerDeptId,  setDrawerDeptId]  = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openClassDrawer(id: string, _name?: string) { setDrawerClassId(id); setDrawerStaffId(null); setDrawerSubjId(null); setDrawerDeptId(null); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openStaffDrawer(id: string, _name?: string) { setDrawerStaffId(id); setDrawerClassId(null); setDrawerSubjId(null); setDrawerDeptId(null); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openSubjDrawer(id: string, _name?: string)  { setDrawerSubjId(id);  setDrawerClassId(null); setDrawerStaffId(null); setDrawerDeptId(null); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function openDeptDrawer(id: string, _name?: string)  { setDrawerDeptId(id);  setDrawerClassId(null); setDrawerStaffId(null); setDrawerSubjId(null); }

  const load = useCallback(async () => {
    try {
      const [classRes, ctxRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/teacher/me"),
      ]);
      const freshClasses: SchoolClass[] = classRes.ok ? await classRes.json() : [];
      const ctxData = ctxRes.ok ? await ctxRes.json() : {};

      const classTeacherOf = ctxData.classTeacherOf ?? null;
      setCtx({
        teacherId:        ctxData.id ?? null,
        classTeacherOf,
        isClassTeacher:   !!classTeacherOf,
        isSubjectTeacher: ctxData.isSubjectTeacher ?? false,
      });

      // Pin own class to top if class teacher
      if (classTeacherOf) {
        const myClass = freshClasses.find((c) => c.id === classTeacherOf.id);
        const others  = freshClasses.filter((c) => c.id !== classTeacherOf.id);
        setClasses(myClass ? [myClass, ...others] : freshClasses);
      } else {
        setClasses(freshClasses);
      }
    } catch {
      setClasses([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const distinctForms = [...new Set((classes ?? []).map((c) => c.form))].sort((a, b) => a - b);

  const visibleClasses = (classes ?? []).filter((c) =>
    (!filterForm      || c.form === Number(filterForm)) &&
    (!filterFramework || c.frameworkType === filterFramework)
  );

  const isMyClass = (c: SchoolClass) => ctx.isClassTeacher && c.id === ctx.classTeacherOf?.id;

  // Class teachers can open their own class's drawer to assign subject teachers.
  // All others open in read-only mode (no write API calls are exposed for them).
  const handleRowClick = (c: SchoolClass) => openClassDrawer(c.id);

  return (
    <div>
      <ContextNavigation items={getTeacherAcademicsNav(ctx.isSubjectTeacher)} />

      <PageHeader
        title="Classes"
        description={
          ctx.isClassTeacher
            ? `You are the class teacher of ${ctx.classTeacherOf?.name}. You can assign subject teachers for your class.`
            : "Browse all classes. Contact the principal to make structural changes."
        }
      />

      {/* Own-class highlight banner */}
      {ctx.isClassTeacher && ctx.classTeacherOf && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-teal/5 border border-teal/20">
          <Star className="h-4 w-4 text-teal shrink-0" />
          <p className="text-sm text-ink">
            <span className="font-semibold text-teal">{ctx.classTeacherOf.name}</span>
            {" "}is your class. Click it to assign subject teachers.
          </p>
        </div>
      )}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Filter
          label="Form" value={filterForm}
          options={[
            { value: "", label: "All forms" },
            ...distinctForms.map((f) => ({ value: String(f), label: `Form ${f}` })),
          ]}
          onChange={setFilterForm}
        />
        <WorkspaceToolbar.Filter
          label="Framework" value={filterFramework}
          options={[
            { value: "", label: "All frameworks" },
            { value: "EIGHT_FOUR_FOUR", label: "8-4-4" },
            { value: "CBC",             label: "CBC"   },
            { value: "CBE",             label: "CBE"   },
          ]}
          onChange={setFilterFramework}
        />
        {(filterForm || filterFramework) && (
          <button
            type="button"
            className="text-sm text-teal hover:text-teal/80 transition-colors"
            onClick={() => { setFilterForm(""); setFilterFramework(""); }}
          >
            Clear filters
          </button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount count={visibleClasses.length} total={classes?.length} label="class" />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {classes === null ? (
        <SkeletonTable rows={6} cols={5} />
      ) : classes.length === 0 ? (
        <EmptyState message="No classes have been set up yet." />
      ) : visibleClasses.length === 0 ? (
        <EmptyState message="No classes match your filters." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Class</th>
                  <th className="px-5 py-3.5 w-[80px]">Form</th>
                  <th className="px-5 py-3.5 w-[110px]">Framework</th>
                  <th className="px-5 py-3.5">Class teacher</th>
                  <th className="px-5 py-3.5 w-[90px]">Students</th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((c) => {
                  const mine = isMyClass(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleRowClick(c)}
                      className={`group border-b border-line last:border-0 transition-colors cursor-pointer
                        ${mine
                          ? "bg-teal-50/40 hover:bg-teal-50/70"
                          : "hover:bg-slate-50/50"
                        }`}
                    >
                      {/* Class name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className={`text-sm font-semibold transition-colors
                              ${mine ? "text-teal" : "text-ink group-hover:text-teal"}`}>
                              {c.name}
                            </p>
                            {c.stream && (
                              <p className="text-xs text-slate/60">{c.stream} stream</p>
                            )}
                          </div>
                          {mine && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal/15 text-teal text-[10px] font-semibold uppercase tracking-wide shrink-0">
                              <Star className="h-2.5 w-2.5" />
                              Your class
                            </span>
                          )}
                          <ExternalLink className="h-3.5 w-3.5 text-slate/30 group-hover:text-teal transition-colors shrink-0" />
                        </div>
                      </td>

                      {/* Form */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-slate">Form {c.form}</span>
                      </td>

                      {/* Framework */}
                      <td className="px-5 py-3.5">
                        <FrameworkBadge type={c.frameworkType} />
                      </td>

                      {/* Class teacher */}
                      <td className="px-5 py-3.5">
                        {c.classTeacher ? (
                          <span className="text-sm text-ink">{c.classTeacher.fullName}</span>
                        ) : (
                          <span className="text-xs text-slate/50 italic">Not assigned</span>
                        )}
                      </td>

                      {/* Students */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate/50" />
                          <span className="text-sm text-slate tabular-nums">{c._count.students}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawers ── class teachers can assign subjects in their own class;
           all rows are clickable to view class details in read-only mode.
           basePath="teacher" signals the drawer to only show assign controls
           for the teacher's own class (the drawer already scopes by basePath). */}
      <ClassWorkspaceDrawer
        classId={drawerClassId}
        open={!!drawerClassId}
        onClose={() => setDrawerClassId(null)}
        onOpenStaff={(id, name) => openStaffDrawer(id, name)}
        onOpenSubject={(id, name) => openSubjDrawer(id, name)}
        basePath="/teacher"
        readOnly={!ctx.isClassTeacher || drawerClassId !== ctx.classTeacherOf?.id}
      />
      <StaffProfileDrawer
        staffId={drawerStaffId}
        open={!!drawerStaffId}
        onClose={() => setDrawerStaffId(null)}
        onOpenDepartment={(id, name) => openDeptDrawer(id, name)}
        onOpenClass={(id, name) => openClassDrawer(id, name)}
        basePath="/teacher"
      />
      <SubjectWorkspaceDrawer
        subjectId={drawerSubjId}
        open={!!drawerSubjId}
        onClose={() => setDrawerSubjId(null)}
        onOpenStaff={(id, name) => openStaffDrawer(id, name)}
        onOpenDepartment={(id, name) => openDeptDrawer(id, name)}
        basePath="/teacher"
      />
      <DepartmentWorkspaceDrawer
        departmentId={drawerDeptId}
        open={!!drawerDeptId}
        onClose={() => setDrawerDeptId(null)}
        onOpenStaff={(id, name) => openStaffDrawer(id, name)}
        onOpenSubject={(id, name) => openSubjDrawer(id, name)}
        basePath="/teacher"
      />
    </div>
  );
}
