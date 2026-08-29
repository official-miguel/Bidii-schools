"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import {
  PageHeader, ErrorBanner, EmptyState,
  Chip, ActionIconButton,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import ClassWorkspaceDrawer  from "@/components/entity-drawers/ClassWorkspaceDrawer";
import StaffProfileDrawer    from "@/components/entity-drawers/StaffProfileDrawer";
import DepartmentWorkspaceDrawer from "@/components/entity-drawers/DepartmentWorkspaceDrawer";
import SubjectWorkspaceDrawer from "@/components/entity-drawers/SubjectWorkspaceDrawer";
import { Pencil, Trash2, CalendarDays, Plus, Users, ExternalLink } from "lucide-react";

type Teacher = { id: string; fullName: string };
type SchoolClass = {
  id: string; name: string; form: number; stream: string | null;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBC" | "CBE";
  classTeacher: Teacher | null;
  _count: { students: number };
};

function FrameworkBadge({ type }: { type: string }) {
  if (type === "CBE")  return <Chip variant="purple" size="xs">CBE</Chip>;
  if (type === "CBC")  return <Chip variant="teal"   size="xs">CBC</Chip>;
  return                      <Chip variant="default" size="xs">8-4-4</Chip>;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<SchoolClass | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [frameworkType, setFrameworkType] = useState<"EIGHT_FOUR_FOUR" | "CBC" | "CBE">("EIGHT_FOUR_FOUR");
  const [filterForm, setFilterForm]           = useState("");
  const [filterFramework, setFilterFramework] = useState("");

  // ── Entity drawer state ───────────────────────────────────────────────────
  const [drawerClassId, setDrawerClassId] = useState<string | null>(null);
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null);
  const [drawerDeptId,  setDrawerDeptId]  = useState<string | null>(null);
  const [drawerSubjId,  setDrawerSubjId]  = useState<string | null>(null);

  function openClassDrawer(id: string) { setDrawerClassId(id); setDrawerStaffId(null); setDrawerDeptId(null); setDrawerSubjId(null); }
  function openStaffDrawer(id: string) { setDrawerStaffId(id); setDrawerClassId(null); setDrawerDeptId(null); setDrawerSubjId(null); }
  function openDeptDrawer(id: string)  { setDrawerDeptId(id);  setDrawerClassId(null); setDrawerStaffId(null); setDrawerSubjId(null); }
  function openSubjDrawer(id: string)  { setDrawerSubjId(id);  setDrawerClassId(null); setDrawerStaffId(null); setDrawerDeptId(null); }

  const load = useCallback(async () => {
    try {
      const [classRes, teacherRes] = await Promise.all([fetch("/api/classes", { cache: "no-store" }), fetch("/api/staff", { cache: "no-store" })]);
      const freshClasses  = classRes.ok  ? await classRes.json()  : [];
      const freshTeachers = teacherRes.ok ? await teacherRes.json() : [];
      setClasses(freshClasses);
      setTeachers(freshTeachers.map((t: { id: string; fullName: string }) => ({ id: t.id, fullName: t.fullName })));
    } catch {
      setClasses([]);
    }
  }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() { setEditing(null); setError(null); setFrameworkType("EIGHT_FOUR_FOUR"); setModalOpen(true); }
  function openEdit(c: SchoolClass) { setEditing(c); setError(null); setFrameworkType(c.frameworkType); setModalOpen(true); }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const fd   = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    // Form number is now entered explicitly by the principal — no regex guessing.
    const formValue = parseInt(fd.get("form") as string, 10);
    if (!formValue || formValue < 1) { setError("Enter a valid form / year level number."); return; }
    const payload = {
      name,
      form: formValue,
      stream: (fd.get("stream") as string) || "",
      classTeacherId: (fd.get("classTeacherId") as string) || null,
      frameworkType: editing ? editing.frameworkType : frameworkType,
    };
    const res  = await fetch(editing ? `/api/classes/${editing.id}` : "/api/classes", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Something went wrong."); return; }
    setModalOpen(false); load();
  }

  async function handleDelete(c: SchoolClass) {
    if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
    const res  = await fetch(`/api/classes/${c.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Couldn't delete class."); return; }
    load();
  }

  // Build distinct form values from loaded classes — no hardcoded list
  const distinctForms = [...new Set((classes ?? []).map((c) => c.form))].sort((a, b) => a - b);

  const visibleClasses = (classes ?? []).filter((c) =>
    (!filterForm      || c.form === Number(filterForm)) &&
    (!filterFramework || c.frameworkType === filterFramework)
  );

  return (
    <div>
      <ContextNavigation items={[
        { href: "/principal/classes",    label: "Classes" },
        { href: "/principal/subjects",   label: "Subjects" },
        { href: "/principal/timetable",  label: "Timetable" },
        { href: "/principal/attendance", label: "Attendance" },
        { href: "/principal/calendar",   label: "Calendar" },
        { href: "/principal/assessments",label: "Exams & Analysis" },
      ]} />

      <PageHeader
        title="Classes"
        description="Classes group students together and determine their timetable and class teacher."
        action={
          <button className={primaryButtonClass} onClick={openCreate}>
            <Plus className="h-4 w-4" />Add class
          </button>
        }
      />

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
            { value: "CBC", label: "CBC" },
            { value: "CBE", label: "CBE" },
          ]}
          onChange={setFilterFramework}
        />
        {(filterForm || filterFramework) && (
          <button type="button" className="text-sm text-teal hover:text-teal/80 transition-colors"
            onClick={() => { setFilterForm(""); setFilterFramework(""); }}>
            Clear filters
          </button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount count={visibleClasses.length} total={classes?.length} label="class" />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {classes === null ? (
        <SkeletonTable rows={6} cols={6} />
      ) : classes.length === 0 ? (
        <EmptyState message="No classes yet. Add one, e.g. Form 3 North." />
      ) : visibleClasses.length === 0 ? (
        <EmptyState message="No classes match your filters." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Class</th>
                  <th className="px-5 py-3.5 w-[80px]">Form</th>
                  <th className="px-5 py-3.5 w-[110px]">Framework</th>
                  <th className="px-5 py-3.5">Class teacher</th>
                  <th className="px-5 py-3.5 w-[90px]">Students</th>
                  <th className="px-5 py-3.5 w-[112px]" />
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((c) => (
                  <tr key={c.id} className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openClassDrawer(c.id)}>
                    {/* Class name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors">{c.name}</p>
                          {c.stream && <p className="text-xs text-slate/60">{c.stream} stream</p>}
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-slate/30 group-hover:text-teal transition-colors shrink-0" />
                      </div>
                    </td>
                    {/* Form */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate">Form {c.form}</span>
                    </td>
                    {/* Framework badge */}
                    <td className="px-5 py-3.5">
                      <FrameworkBadge type={c.frameworkType} />
                    </td>
                    {/* Class teacher */}
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {c.classTeacher ? (
                        <button
                          type="button"
                          onClick={() => openStaffDrawer(c.classTeacher!.id)}
                          className="text-sm text-teal hover:underline flex items-center gap-1"
                        >
                          {c.classTeacher.fullName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate/50 italic">Not assigned</span>
                      )}
                    </td>
                    {/* Student count */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate/50" />
                        <span className="text-sm text-slate tabular-nums">{c._count.students}</span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href={`/principal/timetable?classId=${c.id}`}>
                          <ActionIconButton
                            icon={<CalendarDays className="h-4 w-4" />}
                            label="View timetable"
                            onClick={() => {}}
                          />
                        </Link>
                        <ActionIconButton icon={<Pencil className="h-4 w-4" />}   label="Edit class"    onClick={() => openEdit(c)} />
                        <ActionIconButton icon={<Trash2 className="h-4 w-4" />}   label="Delete class"  variant="danger" onClick={() => handleDelete(c)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? "Edit class" : "Add class"}
          description={editing ? "Update class information and assignment." : "Create a new class grouping for students."}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorBanner message={error} />}

            {/* Basic information section */}
            <div className="form-section">
              <div className="form-section-title">Basic Information</div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>
                    Class name <span className="text-danger">*</span>
                  </label>
                  <input
                    name="name"
                    required
                    defaultValue={editing?.name}
                    className={inputClass}
                    placeholder="e.g. Form 3, Grade 7, Year 10, S3"
                  />
                  <p className="text-xs text-slate mt-1.5">
                    This is the full class name students will see in their timetable and records.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>
                    Form / Year level <span className="text-danger">*</span>
                  </label>
                  <input
                    name="form"
                    type="number"
                    required
                    min="1"
                    defaultValue={editing?.form ?? ""}
                    className={inputClass}
                    placeholder="e.g. 3"
                  />
                  <p className="text-xs text-slate mt-1.5">
                    The numeric year group this class belongs to. Used to match subjects and filter reports.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Stream (optional)</label>
                  <input
                    name="stream"
                    defaultValue={editing?.stream || ""}
                    className={inputClass}
                    placeholder="e.g. North, A, Science"
                  />
                  <p className="text-xs text-slate mt-1.5">
                    Used to distinguish parallel classes with the same name.
                  </p>
                </div>
              </div>
            </div>

            {/* Framework section — only for new classes */}
            {!editing && (
              <div className="form-section">
                <div className="form-section-title">Curriculum Framework</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {(["EIGHT_FOUR_FOUR", "CBE"] as const).map((fw) => (
                      <label
                        key={fw}
                        className={`radio-card ${frameworkType === fw ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="frameworkType"
                          value={fw}
                          checked={frameworkType === fw}
                          onChange={() => setFrameworkType(fw)}
                        />
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              frameworkType === fw
                                ? "border-teal bg-teal"
                                : "border-line"
                            }`}
                          >
                            {frameworkType === fw && (
                              <div className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="text-sm font-medium text-ink">
                            {fw === "EIGHT_FOUR_FOUR" ? "8-4-4 (KCSE)" : "CBE (Competency)"}
                          </span>
                        </div>
                        <p className="text-xs text-slate mt-1.5 ml-6">
                          {fw === "EIGHT_FOUR_FOUR"
                            ? "Traditional KCSE curriculum with national exams"
                            : "Competency-based pathway with continuous assessment"}
                        </p>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/15 text-warn text-xs px-3 py-2">
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
                    </svg>
                    <span>Framework cannot be changed after the class is created.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Staff assignment section */}
            <div className="form-section">
              <div className="form-section-title">Staff Assignment</div>
              <div>
                <label className={labelClass}>Class teacher</label>
                <select
                  name="classTeacherId"
                  defaultValue={editing?.classTeacher?.id || ""}
                  className={inputClass}
                >
                  <option value="">— Not assigned —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate mt-1.5">
                  The class teacher oversees attendance, discipline, and student welfare.
                </p>
              </div>
            </div>

            {/* Form actions — kept inside the form so they work on mobile */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className={secondaryButtonClass} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass}>
                {editing ? "Save changes" : "Add class"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Entity drawers — intelligent cross-navigation ── */}
      <ClassWorkspaceDrawer
        classId={drawerClassId}
        open={!!drawerClassId}
        onClose={() => setDrawerClassId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenSubject={(id) => openSubjDrawer(id)}
        basePath="/principal"
      />
      <StaffProfileDrawer
        staffId={drawerStaffId}
        open={!!drawerStaffId}
        onClose={() => setDrawerStaffId(null)}
        onOpenDepartment={(id) => openDeptDrawer(id)}
        onOpenClass={(id) => openClassDrawer(id)}
        basePath="/principal"
      />
      <DepartmentWorkspaceDrawer
        departmentId={drawerDeptId}
        open={!!drawerDeptId}
        onClose={() => setDrawerDeptId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenSubject={(id) => openSubjDrawer(id)}
        basePath="/principal"
      />
      <SubjectWorkspaceDrawer
        subjectId={drawerSubjId}
        open={!!drawerSubjId}
        onClose={() => setDrawerSubjId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenDepartment={(id) => openDeptDrawer(id)}
        basePath="/principal"
      />
    </div>
  );
}
