"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import Link from "next/link";
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
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import SubjectWorkspaceDrawer from "@/components/entity-drawers/SubjectWorkspaceDrawer";
import StaffProfileDrawer    from "@/components/entity-drawers/StaffProfileDrawer";
import DepartmentWorkspaceDrawer from "@/components/entity-drawers/DepartmentWorkspaceDrawer";
import ClassWorkspaceDrawer  from "@/components/entity-drawers/ClassWorkspaceDrawer";
import { ExternalLink } from "lucide-react";

type Department = { id: string; name: string };
type Subject = {
  id: string;
  name: string;
  code: string;
  type: "CORE" | "ELECTIVE";
  frameworkTypes: ("EIGHT_FOUR_FOUR" | "CBC" | "CBE")[];
  applicableForms: number[];
  department: Department | null;
  _count: { teacherSubjects: number };
  isGroupMember?: boolean;
  memberOfGroups?: { id: string; name: string }[];
};

type SchoolClass = { id: string; name: string; form: number };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedForms, setSelectedForms] = useState<number[]>([]);
  const [frameworkTypes, setFrameworkTypes] = useState<("EIGHT_FOUR_FOUR" | "CBC" | "CBE")[]>(["EIGHT_FOUR_FOUR"]);

  // Workspace toolbar filters
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFramework, setFilterFramework] = useState("");

  // ── Entity drawer state ───────────────────────────────────────────────────
  const [drawerSubjId,  setDrawerSubjId]  = useState<string | null>(null);
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null);
  const [drawerDeptId,  setDrawerDeptId]  = useState<string | null>(null);
  const [drawerClassId, setDrawerClassId] = useState<string | null>(null);

  function openSubjDrawer(id: string)  { setDrawerSubjId(id);  setDrawerStaffId(null); setDrawerDeptId(null); setDrawerClassId(null); }
  function openStaffDrawer(id: string) { setDrawerStaffId(id); setDrawerSubjId(null);  setDrawerDeptId(null); setDrawerClassId(null); }
  function openDeptDrawer(id: string)  { setDrawerDeptId(id);  setDrawerSubjId(null);  setDrawerStaffId(null); setDrawerClassId(null); }
  function openClassDrawer(id: string) { setDrawerClassId(id); setDrawerSubjId(null);  setDrawerStaffId(null); setDrawerDeptId(null); }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subjRes, deptRes, classRes] = await Promise.all([
        fetch("/api/subjects",    { cache: "no-store" }),
        fetch("/api/departments", { cache: "no-store" }),
        fetch("/api/classes",     { cache: "no-store" }),
      ]);
      const freshSubjects = await subjRes.json();
      setSubjects(freshSubjects);
      setDepartments(await deptRes.json());
      const freshClasses: SchoolClass[] = classRes.ok ? await classRes.json() : [];
      setClasses(freshClasses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setSelectedForms([]);
    setFrameworkTypes(["EIGHT_FOUR_FOUR"]);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(s: Subject) {
    setEditing(s);
    setSelectedForms(s.applicableForms);
    setFrameworkTypes(s.frameworkTypes?.length ? s.frameworkTypes : ["EIGHT_FOUR_FOUR"]);
    setError(null);
    setModalOpen(true);
  }

  function toggleForm(f: number) {
    setSelectedForms((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name") as string,
      code: form.get("code") as string,
      type: form.get("type") as string,
      departmentId: form.get("departmentId") as string,
      applicableForms: selectedForms,
      frameworkTypes,
    };

    if (selectedForms.length === 0) {
      setError("Select at least one form this subject applies to.");
      return;
    }

    const res = await fetch(editing ? `/api/subjects/${editing.id}` : "/api/subjects", {
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

  async function handleDelete(s: Subject) {
    if (!confirm(`Delete ${s.name}? This can't be undone.`)) return;
    const res = await fetch(`/api/subjects/${s.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Couldn't delete subject.");
      return;
    }
    load();
  }

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="The master subject list. Everything downstream — staff assignment, timetables, results, electives — reads from here."
        action={
          <button
            className={primaryButtonClass}
            onClick={openCreate}
            disabled={!loading && departments.length === 0}
            title={!loading && departments.length === 0 ? "Add a department first" : undefined}
          >
            Add subject
          </button>
        }
      />

      {departments.length === 0 && subjects !== null && !loading && (
        <div className="mb-4 rounded-md bg-warn-bg text-warn text-sm px-3 py-2">
          Create at least one department before adding subjects.
        </div>
      )}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search by name or code…"
        />

        <WorkspaceToolbar.Filter
          label="Department"
          value={filterDept}
          options={[
            { value: "", label: "All departments" },
            ...departments.map(d => ({ value: d.id, label: d.name })),
          ]}
          onChange={setFilterDept}
        />

        <WorkspaceToolbar.Filter
          label="Type"
          value={filterType}
          options={[
            { value: "", label: "All types" },
            { value: "CORE", label: "Core" },
            { value: "ELECTIVE", label: "Elective" },
          ]}
          onChange={setFilterType}
        />

        <WorkspaceToolbar.Filter
          label="Framework"
          value={filterFramework}
          options={[
            { value: "", label: "All frameworks" },
            { value: "EIGHT_FOUR_FOUR", label: "8-4-4" },
            { value: "CBC", label: "CBC" },
            { value: "CBE", label: "CBE" },
          ]}
          onChange={setFilterFramework}
        />

        {(search || filterDept || filterType || filterFramework) && (
          <button
            type="button"
            className="text-sm text-teal hover:underline"
            onClick={() => { setSearch(""); setFilterDept(""); setFilterType(""); setFilterFramework(""); }}
          >
            Clear filters
          </button>
        )}
      </WorkspaceToolbar>

      {subjects === null ? (
        <SkeletonTable rows={8} cols={8} />
      ) : subjects.length === 0 ? (
        <EmptyState message="No subjects yet. Add the subjects your school offers." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-4 py-3.5">Subject</th>
                  <th className="px-4 py-3.5 w-[80px] hidden sm:table-cell">Code</th>
                  <th className="px-4 py-3.5 w-[100px]">Type</th>
                  <th className="px-4 py-3.5 w-[100px] hidden sm:table-cell">Framework</th>
                  <th className="px-4 py-3.5 hidden md:table-cell">Department</th>
                  <th className="px-4 py-3.5 w-[110px] hidden sm:table-cell">Forms</th>
                  <th className="px-4 py-3.5 w-[80px] hidden lg:table-cell">Teachers</th>
                  {/* Actions column — always visible, sticky on the right so it
                      never scrolls off screen on narrow viewports */}
                  <th className="px-4 py-3.5 w-[88px] sticky right-0 bg-slate-50/80 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {(subjects ?? [])
                  .filter(s => {
                    const q = search.toLowerCase();
                    if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
                    if (filterDept && (!s.department || s.department.id !== filterDept)) return false;
                    if (filterType && s.type !== filterType) return false;
                    if (filterFramework && !("isGroup" in s && s.isGroup) && !(s as Subject).frameworkTypes?.includes(filterFramework as "EIGHT_FOUR_FOUR" | "CBC" | "CBE")) return false;
                    return true;
                  })
                  .map((s) => (
                  <tr
                    key={s.id}
                    className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => openSubjDrawer(s.id)}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink group-hover:text-teal transition-colors">{s.name}</span>
                        {s.isGroupMember && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            📦 Group Member
                          </span>
                        )}
                        <ExternalLink className="h-3.5 w-3.5 text-slate/30 group-hover:text-teal transition-colors shrink-0 hidden sm:block" />
                      </div>
                      {/* Show group membership info */}
                      {s.isGroupMember && s.memberOfGroups && s.memberOfGroups.length > 0 && (
                        <div className="text-xs text-slate mt-1">
                          Member of: {s.memberOfGroups.map(g => g.name).join(', ')}
                        </div>
                      )}
                      {/* On mobile, show code + forms inline under the name */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 sm:hidden">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1 py-0.5">{s.code}</span>
                        {(s.applicableForms ?? []).sort((a, b) => a - b).map(f => (
                          <Chip key={f} variant="default" size="xs">F{f}</Chip>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">{s.code}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                        {s.type === "CORE" ? "Core" : "Elective"}
                      </Chip>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      {!("isGroup" in s && s.isGroup) && (
                        <div className="flex flex-wrap gap-1">
                          {((s as Subject).frameworkTypes ?? ["EIGHT_FOUR_FOUR"]).map((fw) => (
                            <Chip
                              key={fw}
                              variant={fw === "CBC" ? "teal" : fw === "CBE" ? "purple" : "default"}
                              size="xs"
                            >
                              {fw === "EIGHT_FOUR_FOUR" ? "8-4-4" : fw}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                      {s.department ? (
                        <button
                          type="button"
                          onClick={() => openDeptDrawer(s.department!.id)}
                          className="text-sm text-slate hover:text-teal hover:underline flex items-center gap-1 transition-colors"
                        >
                          {s.department.name}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400 italic">No department</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-0.5">
                        {(s.applicableForms ?? []).sort((a, b) => a - b).map(f => (
                          <Chip key={f} variant="default" size="xs">F{f}</Chip>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-sm text-slate tabular-nums">{s._count.teacherSubjects}</span>
                    </td>
                    {/* Sticky actions cell — always visible */}
                    <td
                      className="px-4 py-3.5 sticky right-0 bg-white group-hover:bg-slate-50/50 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionIconButton
                          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" /></svg>}
                          label="Edit"
                          onClick={() => openEdit(s)}
                        />
                        <ActionIconButton
                          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>}
                          label="Delete"
                          variant="danger"
                          onClick={() => handleDelete(s)}
                        />
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
          key={editing?.id ?? "new"}
          title={editing ? "Edit subject" : "Add subject"}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Subject name</label>
                <input
                  name="name"
                  required
                  defaultValue={editing?.name}
                  className={inputClass}
                  placeholder="e.g. Biology"
                />
              </div>
              <div>
                <label className={labelClass}>Code</label>
                <input
                  name="code"
                  required
                  maxLength={10}
                  defaultValue={editing?.code}
                  className={inputClass}
                  placeholder="e.g. BIO"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Default type</label>
                <select name="type" defaultValue={editing?.type || "CORE"} className={inputClass}>
                  <option value="CORE">Core (compulsory)</option>
                  <option value="ELECTIVE">Elective</option>
                </select>
                <p className="text-xs text-slate mt-1.5">
                  School-wide default. Override per class by opening the class in the{" "}
                  <Link href="/principal/classes" className="text-teal hover:underline">
                    Classes
                  </Link>{" "}tab.
                </p>
              </div>
              <div>
                <label className={labelClass}>Department</label>
                <select
                  name="departmentId"
                  required
                  defaultValue={editing?.department?.id || ""}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Curriculum frameworks</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(["EIGHT_FOUR_FOUR", "CBC", "CBE"] as const).map((fw) => {
                  const active = frameworkTypes.includes(fw);
                  return (
                    <button
                      type="button"
                      key={fw}
                      onClick={() =>
                        setFrameworkTypes((prev) =>
                          active
                            ? prev.length > 1 ? prev.filter((f) => f !== fw) : prev // keep at least one
                            : [...prev, fw]
                        )
                      }
                      className={`text-sm rounded-lg border px-3 py-2 transition-colors text-left ${
                        active
                          ? "bg-teal text-white border-teal"
                          : "border-line text-ink hover:bg-paper"
                      }`}
                    >
                      <span className="font-medium block">
                        {fw === "EIGHT_FOUR_FOUR" ? "8-4-4" : fw}
                      </span>
                      <span className={`text-[11px] block mt-0.5 ${active ? "text-white/80" : "text-slate"}`}>
                        {fw === "EIGHT_FOUR_FOUR" ? "KCSE" : fw === "CBC" ? "Competency-based" : "TVET / CBE"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate mt-1.5">
                Select all frameworks this subject applies to. A class will show this subject if it matches any selected framework.
              </p>
            </div>

            <div>
              <label className={labelClass}>Applies to forms</label>
              {classes.length === 0 ? (
                <p className="text-xs text-slate mt-1">
                  No classes found.{" "}
                  <Link href="/principal/classes" className="text-teal underline">
                    Add classes first
                  </Link>{" "}
                  to select which forms this subject applies to.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-1">
                  {[...new Set(classes.map((c) => c.form))].sort((a, b) => a - b).map((f) => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => toggleForm(f)}
                      className={`text-sm rounded-md border px-3 py-1.5 min-h-[44px] sm:min-h-0 transition-colors ${
                        selectedForms.includes(f)
                          ? "bg-teal text-white border-teal"
                          : "border-line text-ink hover:bg-paper"
                      }`}
                    >
                      Form {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass}>
                {editing ? "Save changes" : "Add subject"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Entity drawers — intelligent cross-navigation ── */}
      <SubjectWorkspaceDrawer
        subjectId={drawerSubjId}
        open={!!drawerSubjId}
        onClose={() => setDrawerSubjId(null)}
        onOpenStaff={(id) => openStaffDrawer(id)}
        onOpenDepartment={(id) => openDeptDrawer(id)}
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
