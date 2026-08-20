"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  Chip,
  ActionIconButton,
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
import { ExternalLink } from "lucide-react";

type Teacher = { id: string; fullName: string };
type Department = {
  id: string;
  name: string;
  headTeacher: Teacher | null;
  _count: { subjects: number; teachers: number };
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      setTeachers(teacherData.map((t: { id: string; fullName: string }) => ({ id: t.id, fullName: t.fullName })));
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
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setError(null);
    setModalOpen(true);
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
              <select
                name="headTeacherId"
                defaultValue={editing?.headTeacher?.id || ""}
                className={inputClass}
              >
                <option value="">— not assigned —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate mt-1">
                Only registered staff can be set as head. Register the teacher first if they&apos;re
                not in this list.
              </p>
            </div>
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
