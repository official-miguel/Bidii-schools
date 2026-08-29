"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  Chip,
  ActionIconButton,
  Spinner,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import DepartmentWorkspaceDrawer from "@/components/entity-drawers/DepartmentWorkspaceDrawer";
import StaffProfileDrawer    from "@/components/entity-drawers/StaffProfileDrawer";
import SubjectWorkspaceDrawer from "@/components/entity-drawers/SubjectWorkspaceDrawer";
import ClassWorkspaceDrawer  from "@/components/entity-drawers/ClassWorkspaceDrawer";
import { ExternalLink, Plus, X } from "lucide-react";

type TeacherSubjectEntry = {
  subject: { id: string; name: string; departmentId: string };
};
type Teacher = {
  id: string;
  fullName: string;
  teacherSubjects?: TeacherSubjectEntry[];
};
type Department = {
  id: string;
  name: string;
  headTeacher: Teacher | null;
  _count: { subjects: number; teachers: number };
};
type SubjectOption = {
  id: string;
  name: string;
  code: string;
  type: "CORE" | "ELECTIVE";
  department: { id: string; name: string };
};
type DeptSubject = {
  id: string;
  name: string;
  code: string;
  type: "CORE" | "ELECTIVE";
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Subject management inside modal ──────────────────────────────────────
  const [deptSubjects, setDeptSubjects]         = useState<DeptSubject[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<SubjectOption[]>([]);
  const [subjectSearch, setSubjectSearch]       = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [subjectSaving, setSubjectSaving]       = useState<string | null>(null);

  // ── Entity drawer state ───────────────────────────────────────────────────
  const [drawerDeptId,  setDrawerDeptId]  = useState<string | null>(null);
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null);
  const [drawerSubjId,  setDrawerSubjId]  = useState<string | null>(null);
  const [drawerClassId, setDrawerClassId] = useState<string | null>(null);

  function openDeptDrawer(id: string)  { setDrawerDeptId(id);  setDrawerStaffId(null); setDrawerSubjId(null); setDrawerClassId(null); }
  function openStaffDrawer(id: string) { setDrawerStaffId(id); setDrawerDeptId(null);  setDrawerSubjId(null); setDrawerClassId(null); }
  function openSubjDrawer(id: string)  { setDrawerSubjId(id);  setDrawerDeptId(null);  setDrawerStaffId(null); setDrawerClassId(null); }
  function openClassDrawer(id: string) { setDrawerClassId(id); setDrawerDeptId(null);  setDrawerStaffId(null); setDrawerSubjId(null); }

  const load = useCallback(async () => {
    try {
      const [deptRes, teacherRes] = await Promise.all([
        fetch("/api/departments", { cache: "no-store" }),
        fetch("/api/staff",       { cache: "no-store" }),
      ]);
      const freshDepts  = deptRes.ok   ? await deptRes.json()   : [];
      const teacherData = teacherRes.ok ? await teacherRes.json() : [];
      setDepartments(freshDepts);
      setTeachers(teacherData.map((t: { id: string; fullName: string; teacherSubjects?: TeacherSubjectEntry[] }) => ({
        id: t.id,
        fullName: t.fullName,
        teacherSubjects: t.teacherSubjects ?? [],
      })));
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setError(null);
    setDeptSubjects([]);
    setAvailableSubjects([]);
    setSubjectSearch("");
    setSubjectPickerOpen(false);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setError(null);
    setDeptSubjects([]);
    setAvailableSubjects([]);
    setSubjectSearch("");
    setSubjectPickerOpen(false);
    setModalOpen(true);
    // Load current subjects for this department
    fetch(`/api/departments/${d.id}/detail`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setDeptSubjects(data.subjects ?? []); });
    // Load available (not yet in this department) subjects
    fetch(`/api/departments/${d.id}/available-subjects`)
      .then((r) => r.json())
      .then((data: SubjectOption[]) => { if (!Array.isArray(data)) return; setAvailableSubjects(data); });
  }

  async function addSubjectToDept(subject: SubjectOption) {
    if (!editing) return;
    setSubjectSaving(subject.id);
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: editing.id }),
      });
      if (res.ok) {
        const newSubject: DeptSubject = { id: subject.id, name: subject.name, code: subject.code, type: subject.type };
        setDeptSubjects((prev) => [...prev, newSubject].sort((a, b) => a.name.localeCompare(b.name)));
        setAvailableSubjects((prev) => prev.filter((s) => s.id !== subject.id));
        setSubjectPickerOpen(false);
        setSubjectSearch("");
        load(); // refresh table counts
      }
    } finally {
      setSubjectSaving(null);
    }
  }

  async function moveSubjectOut(subject: DeptSubject) {
    // Moving a subject out requires choosing a target department — we open
    // the full workspace drawer for that. For the modal we just prevent
    // accidental removal: redirect user to the workspace drawer.
    // Instead, offer a simple "move to another dept" by prompting which dept.
    const otherDepts = (departments ?? []).filter((d) => d.id !== editing?.id);
    if (otherDepts.length === 0) {
      alert("No other departments to move this subject to.");
      return;
    }
    const names = otherDepts.map((d, i) => `${i + 1}. ${d.name}`).join("\n");
    const choice = prompt(`Move "${subject.name}" to which department?\n\n${names}\n\nType the number:`);
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= otherDepts.length) { alert("Invalid choice."); return; }
    const target = otherDepts[idx];
    setSubjectSaving(subject.id);
    try {
      const res = await fetch(`/api/subjects/${subject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: target.id }),
      });
      if (res.ok) {
        setDeptSubjects((prev) => prev.filter((s) => s.id !== subject.id));
        const moved: SubjectOption = { id: subject.id, name: subject.name, code: subject.code, type: subject.type, department: { id: target.id, name: target.name } };
        setAvailableSubjects((prev) => [...prev, moved].sort((a, b) => a.name.localeCompare(b.name)));
        load();
      }
    } finally {
      setSubjectSaving(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name") as string,
      headTeacherId: (form.get("headTeacherId") as string) || null,
    };

    const res = await fetch(editing ? `/api/departments/${editing.id}` : "/api/departments", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setModalOpen(false);
    load();
  }

  async function handleDelete(d: Department) {
    if (!confirm(`Delete ${d.name}? This can't be undone.`)) return;
    const res = await fetch(`/api/departments/${d.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Couldn't delete department.");
      return;
    }
    load();
  }

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/departments",    label: "Departments" },
          { href: "/principal/classes",        label: "Classes" },
          { href: "/principal/subjects",       label: "Subjects" },
          { href: "/principal/timetable",      label: "Timetable" },
          { href: "/principal/attendance",     label: "Attendance" },
          { href: "/principal/calendar",       label: "Calendar" },
          { href: "/principal/assessments",    label: "Exams & Analysis" },
        ]}
      />
      
      <PageHeader
        title="Departments"
        description="Group related subjects under a department and assign a head."
        action={
          <button className={primaryButtonClass} onClick={openCreate}>
            Add department
          </button>
        }
      />

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search departments…"
        />
      </WorkspaceToolbar>

      {departments === null ? (
        <SkeletonTable rows={5} cols={5} />
      ) : departments.length === 0 ? (
        <EmptyState message="No departments yet. Add your first one to start building the subject list." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Head of department</th>
                  <th className="px-5 py-3.5 w-[100px]">Subjects</th>
                  <th className="px-5 py-3.5 w-[80px]">Staff</th>
                  <th className="px-5 py-3.5 w-[80px]" />
                </tr>
              </thead>
              <tbody>
                {(departments ?? [])
                  .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()))
                  .map((d) => (
                  <tr key={d.id} className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openDeptDrawer(d.id)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink group-hover:text-teal transition-colors">{d.name}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-slate/30 group-hover:text-teal transition-colors shrink-0" />
                      </div>
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {d.headTeacher
                        ? <button type="button" onClick={() => openStaffDrawer(d.headTeacher!.id)} className="text-sm text-teal hover:underline flex items-center gap-1">{d.headTeacher.fullName}<ExternalLink className="h-3 w-3" /></button>
                        : <span className="text-xs text-slate/50 italic">Not assigned</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <Chip variant="default" size="xs">{d._count.subjects} subjects</Chip>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate tabular-nums">{d._count.teachers}</span>
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionIconButton icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" /></svg>} label="Edit" onClick={() => openEdit(d)} />
                        <ActionIconButton icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>} label="Delete" variant="danger" onClick={() => handleDelete(d)} />
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
        <Modal title={editing ? "Edit department" : "Add department"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <div>
              <label className={labelClass}>Department name</label>
              <input
                name="name"
                required
                defaultValue={editing?.name}
                className={inputClass}
                placeholder="e.g. Sciences"
              />
            </div>
            <div>
              <label className={labelClass}>Head of department</label>
              {(() => {
                const eligible = editing
                  ? teachers.filter((t) =>
                      t.teacherSubjects?.some((ts) => ts.subject.departmentId === editing.id)
                    )
                  : [];
                return (
                  <>
                    <select
                      name="headTeacherId"
                      defaultValue={editing?.headTeacher?.id || ""}
                      className={inputClass}
                    >
                      <option value="">— not assigned —</option>
                      {editing
                        ? eligible.map((t) => {
                            const subjectNames = t.teacherSubjects!
                              .filter((ts) => ts.subject.departmentId === editing.id)
                              .map((ts) => ts.subject.name)
                              .join(", ");
                            return (
                              <option key={t.id} value={t.id}>
                                {t.fullName}{subjectNames ? ` (${subjectNames})` : ""}
                              </option>
                            );
                          })
                        : teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName}
                            </option>
                          ))}
                    </select>
                    {editing && eligible.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        No teachers are currently assigned subjects in this department. Assign subjects to staff first.
                      </p>
                    )}
                    {!editing && (
                      <p className="text-xs text-slate mt-1">
                        Save the department first, then assign subjects to staff before setting a HOD.
                      </p>
                    )}
                    {editing && eligible.length > 0 && (
                      <p className="text-xs text-slate mt-1">
                        Only teachers who teach a subject in this department are shown.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
            {/* ── Subjects in this department ── (edit mode only) */}
            {editing && (
              <div>
                <label className={labelClass}>Subjects in this department</label>
                <div className="rounded-lg border border-line bg-paper overflow-hidden">
                  {/* Current subjects list */}
                  {deptSubjects.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-slate italic">No subjects assigned yet.</p>
                  ) : (
                    <ul className="divide-y divide-line max-h-44 overflow-y-auto">
                      {deptSubjects.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="font-mono text-xs bg-white border border-line rounded px-1.5 py-0.5 shrink-0 w-14 text-center">
                            {s.code}
                          </span>
                          <span className="flex-1 text-sm text-ink truncate">{s.name}</span>
                          <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                            {s.type === "CORE" ? "Core" : "Elective"}
                          </Chip>
                          <button
                            type="button"
                            title="Move to another department"
                            disabled={subjectSaving === s.id}
                            onClick={() => moveSubjectOut(s)}
                            className="p-1 rounded hover:bg-white text-slate hover:text-danger transition-colors disabled:opacity-40"
                          >
                            {subjectSaving === s.id ? <Spinner size="sm" /> : <X className="h-3.5 w-3.5" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add subject picker */}
                  <div className="border-t border-line">
                    {subjectPickerOpen ? (
                      <div className="p-2 space-y-1.5">
                        <input
                          autoFocus
                          value={subjectSearch}
                          onChange={(e) => setSubjectSearch(e.target.value)}
                          placeholder="Search by name, code or current dept…"
                          className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-line bg-white outline-none focus:border-teal"
                        />
                        <ul className="max-h-44 overflow-y-auto divide-y divide-line rounded-lg border border-line bg-white">
                          {availableSubjects
                            .filter((s) =>
                              s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                              s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                              s.department.name.toLowerCase().includes(subjectSearch.toLowerCase())
                            )
                            .map((s) => (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  disabled={subjectSaving === s.id}
                                  onClick={() => addSubjectToDept(s)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper transition-colors disabled:opacity-50"
                                >
                                  <span className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5 shrink-0 w-14 text-center">
                                    {s.code}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <span className="block font-medium text-ink truncate">{s.name}</span>
                                    <span className="block text-xs text-slate truncate">Currently: {s.department.name}</span>
                                  </div>
                                  <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                                    {s.type === "CORE" ? "Core" : "Elective"}
                                  </Chip>
                                  {subjectSaving === s.id && <Spinner size="sm" />}
                                </button>
                              </li>
                            ))}
                          {availableSubjects.filter((s) =>
                            s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                            s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                            s.department.name.toLowerCase().includes(subjectSearch.toLowerCase())
                          ).length === 0 && (
                            <li className="px-3 py-2 text-sm text-slate italic">
                              {availableSubjects.length === 0
                                ? "All school subjects are already in this department."
                                : "No subjects match your search."}
                            </li>
                          )}
                        </ul>
                        <button
                          type="button"
                          onClick={() => { setSubjectPickerOpen(false); setSubjectSearch(""); }}
                          className="text-xs text-slate hover:text-ink"
                        >
                          Close
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSubjectPickerOpen(true)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-teal hover:bg-white transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add subject to this department
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate mt-1">
                  Subjects here are from the school&apos;s registered subject list. To create new subjects go to the{" "}
                  <a href="/principal/subjects" className="text-teal hover:underline">Subjects</a> page.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass}>
                {editing ? "Save changes" : "Add department"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Entity drawers — intelligent cross-navigation ── */}
      <DepartmentWorkspaceDrawer
        departmentId={drawerDeptId}
        open={!!drawerDeptId}
        onClose={() => setDrawerDeptId(null)}
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
      <SubjectWorkspaceDrawer
        subjectId={drawerSubjId}
        open={!!drawerSubjId}
        onClose={() => setDrawerSubjId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenDepartment={(id) => openDeptDrawer(id)}
        basePath="/principal"
      />
      <ClassWorkspaceDrawer
        classId={drawerClassId}
        open={!!drawerClassId}
        onClose={() => setDrawerClassId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenSubject={(id) => openSubjDrawer(id)}
        basePath="/principal"
      />
    </div>
  );
}
