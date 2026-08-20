"use client";

import { useEffect, useState, useRef, FormEvent, useCallback } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader, ErrorBanner, EmptyState,
  Avatar, Chip, ActionIconButton,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
  royalButtonClass, royalCardClass, dangerLinkClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import { useStaffRolesStore } from "@/lib/stores/staffRolesStore";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import StaffProfileDrawer    from "@/components/entity-drawers/StaffProfileDrawer";
import DepartmentWorkspaceDrawer from "@/components/entity-drawers/DepartmentWorkspaceDrawer";
import ClassWorkspaceDrawer  from "@/components/entity-drawers/ClassWorkspaceDrawer";
import SubjectWorkspaceDrawer from "@/components/entity-drawers/SubjectWorkspaceDrawer";
import { Pencil, UserMinus, UserPlus, ShieldCheck, ExternalLink } from "lucide-react";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

// ─── Types ────────────────────────────────────────────────────────────────────
type Department = { id: string; name: string };
type Subject    = { id: string; name: string; code: string; department: { id: string; name: string } | null };
type StaffRole  = { id: string; name: string };
type Teacher = {
  id: string; fullName: string; staffId: string;
  email: string | null; phone: string | null; todEligible: boolean;
  primaryDepartment: Department | null;
  classTeacherOf: { id: string; name: string } | null;
  teacherSubjects: { subject: Subject }[];
  user: { email: string; isActive: boolean; role: string; mustChangePassword: boolean; staffRole: StaffRole | null } | null;
};
type Permission = { module: string; canView: boolean; canManage: boolean };
type FullRole   = { id: string; name: string; description: string | null; permissions: Permission[]; _count: { users: number }; totalUsers?: number };

const TEACHING_STAFF = "__teacher__";

const MODULE_INFO: Record<string, { label: string; description: string }> = {
  DEPARTMENTS:          { label: "Departments",            description: "Subject departments and heads" },
  SUBJECTS:             { label: "Subjects",               description: "The school's subject list" },
  STAFF:                { label: "Staff",                  description: "Teaching and non-teaching staff records" },
  CLASSES:              { label: "Classes",                description: "Classes and streams" },
  STUDENTS:             { label: "Students",               description: "Student records" },
  TIMETABLE:            { label: "Timetable",              description: "The weekly timetable" },
  EXAM_PERIODS:         { label: "Exam Periods",           description: "Exam sittings" },
  RESULTS:              { label: "Results",                description: "Results and slip generation" },
  TOD:                  { label: "Teacher on Duty",        description: "Duty rosters" },
  COMMUNICATION:        { label: "Communication Centre",   description: "Messages to staff/parents" },
  CALENDAR:             { label: "School Calendar",        description: "The school calendar" },
  AI_TOOLS:             { label: "AI Tools",               description: "AI-assisted scheduling and insights" },
  REPORTS:              { label: "Reports",                description: "End-of-term and analytics reports" },
  RECORDS_DISCIPLINE:   { label: "Records — Discipline",   description: "Discipline cases, files, AI summaries" },
  RECORDS_ACHIEVEMENTS: { label: "Records — Achievements", description: "Achievements, shared achievements, files" },
  LIBRARY:              { label: "Library",                description: "Book catalogue, borrowing, and fines" },
  FEES:                 { label: "Fees Management",        description: "Fee structures, invoicing, payments, and debtor tracking" },
};
const ASSIGNABLE_MODULES = Object.keys(MODULE_INFO);

// ─── Premium role badge ───────────────────────────────────────────────────────
function RoleBadge({ label, variant }: { label: string; variant: "teacher" | "staff" | "none" }) {
  if (variant === "teacher")
    return <Chip variant="teal" size="xs"><ShieldCheck className="h-3 w-3" />{label}</Chip>;
  if (variant === "staff")
    return <Chip variant="info" size="xs">{label}</Chip>;
  return <Chip variant="default" size="xs">{label}</Chip>;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: "directory" | "roles"; onChange: (t: "directory" | "roles") => void }) {
  const tabs: { id: "directory" | "roles"; label: string }[] = [
    { id: "directory", label: "Directory" },
    { id: "roles",     label: "Roles & Permissions" },
  ];
  return (
    <div className="flex border-b border-line mb-6">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            active === t.id
              ? "border-teal text-teal"
              : "border-transparent text-slate hover:text-ink hover:bg-paper"
          }`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Directory tab ─────────────────────────────────────────────────────────────
function DirectoryTab() {
  const storeRoles  = useStaffRolesStore((s) => s.roles);

  const [teachers,    setTeachers]    = useState<Teacher[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects,    setSubjects]    = useState<Subject[]>([]);
  const staffRoles = storeRoles as unknown as StaffRole[];

  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Teacher | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Draft for the "new staff" form — scoped to "new" for creates, staff id for edits
  const staffDraftKey = editing ? `bidii_draft_staff_${editing.id}` : "bidii_draft_staff_new";
  const [staffDraft, setStaffDraft, clearStaffDraft] = useFormDraft(staffDraftKey, {
    roleChoice:       TEACHING_STAFF,
    selectedSubjects: [] as string[],
  });

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(staffDraft.selectedSubjects);
  const [roleChoice, setRoleChoice]   = useState<string>(staffDraft.roleChoice);

  // Persist controlled fields whenever they change (only while modal is open)
  useEffect(() => {
    if (!modalOpen) return;
    setStaffDraft({ roleChoice, selectedSubjects });
  }, [roleChoice, selectedSubjects, modalOpen, setStaffDraft]);
  const [loginCreated, setLoginCreated] = useState<{ email: string } | null>(null);
  const [nextStaffId, setNextStaffId] = useState<string | null>(null);
  const nextStaffIdFetched = useRef(false);
  const [search, setSearch]     = useState("");
  const [filterDept, setFilterDept] = useState("");

  // ── Entity drawer state ───────────────────────────────────────────────────
  const [drawerStaffId,  setDrawerStaffId]  = useState<string | null>(null);
  const [drawerDeptId,   setDrawerDeptId]   = useState<string | null>(null);
  const [drawerClassId,  setDrawerClassId]  = useState<string | null>(null);
  const [drawerSubjId,   setDrawerSubjId]   = useState<string | null>(null);

  function openStaffDrawer(id: string)  { setDrawerStaffId(id);  setDrawerDeptId(null);  setDrawerClassId(null); setDrawerSubjId(null); }
  function openDeptDrawer(id: string)   { setDrawerDeptId(id);   setDrawerStaffId(null); setDrawerClassId(null); setDrawerSubjId(null); }
  function openClassDrawer(id: string)  { setDrawerClassId(id);  setDrawerStaffId(null); setDrawerDeptId(null);  setDrawerSubjId(null); }
  function openSubjDrawer(id: string)   { setDrawerSubjId(id);   setDrawerStaffId(null); setDrawerDeptId(null);  setDrawerClassId(null); }

  const load = useCallback(async () => {
    const [staffRes, deptRes, subjRes] = await Promise.all([
      fetch("/api/staff",        { cache: "no-store" }),
      fetch("/api/departments",  { cache: "no-store" }),
      fetch("/api/subjects",     { cache: "no-store" }),
    ]);
    const [freshStaff, freshDepts, freshSubjs] = await Promise.all([
      staffRes.ok ? staffRes.json() : [],
      deptRes.ok  ? deptRes.json()  : [],
      subjRes.ok  ? subjRes.json()  : [],
    ]);
    setTeachers(freshStaff);
    setDepartments(freshDepts);
    setSubjects(freshSubjs);
  }, []);

  useEffect(() => {
    load();
    // Bootstrap staff roles store if not already loaded
    const roles = useStaffRolesStore.getState();
    if (roles.roles.length === 0 && !roles.loading) {
      roles.fetch().catch(console.error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null);
    // Restore draft values for the new-staff form
    setSelectedSubjects(staffDraft.selectedSubjects);
    setRoleChoice(staffDraft.roleChoice || TEACHING_STAFF);
    setError(null);
    if (!nextStaffIdFetched.current) {
      nextStaffIdFetched.current = true;
      setNextStaffId(null);
      fetch("/api/staff/next-staff-id").then(r => r.json()).then(d => setNextStaffId(d.nextStaffId !== null ? String(d.nextStaffId) : ""));
    }
    setModalOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditing(t);
    // Always use the server data for edits — don't restore a draft
    setSelectedSubjects(t.teacherSubjects.map(ts => ts.subject.id));
    setRoleChoice(t.user?.staffRole?.id || TEACHING_STAFF);
    setError(null);
    setModalOpen(true);
  }

  function toggleSubject(id: string) {
    setSelectedSubjects(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const isTeaching = roleChoice === TEACHING_STAFF;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError(null);
    const form = new FormData(e.currentTarget);
    if (editing) {
      const payload = {
        fullName: form.get("fullName") as string, email: (form.get("email") as string) || "",
        phone: (form.get("phone") as string) || "",
        primaryDepartmentId: isTeaching ? (form.get("primaryDepartmentId") as string) || null : null,
        todEligible: isTeaching ? form.get("todEligible") === "on" : false,
        subjectIds: isTeaching ? selectedSubjects : [], staffRoleId: isTeaching ? null : roleChoice,
      };
      const res = await fetch(`/api/staff/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSubmitting(false); return; }
      clearStaffDraft(); setModalOpen(false); setSubmitting(false); load();
    } else {
      const payload = {
        fullName: form.get("fullName") as string, staffId: (form.get("staffId") as string) || undefined,
        startingStaffId: form.get("startingStaffId") ? Number(form.get("startingStaffId")) : undefined,
        email: (form.get("email") as string) || "", phone: (form.get("phone") as string) || "",
        primaryDepartmentId: isTeaching ? null : ((form.get("primaryDepartmentId") as string) || null),
        todEligible: isTeaching ? form.get("todEligible") === "on" : false,
        subjectIds: isTeaching ? selectedSubjects : [],
        createLogin: isTeaching ? true : true,
        staffRoleId: isTeaching ? null : roleChoice,
      };
      const res = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.error) { setError(data.error || "Something went wrong."); setSubmitting(false); return; }
      clearStaffDraft();
      setModalOpen(false);
      setSubmitting(false);
      if (res.ok) setLoginCreated({ email: payload.email });
      nextStaffIdFetched.current = false; setNextStaffId(null); load();
    }
  }

  // ── Transfer Staff dialog state ───────────────────────────────────────────
  const [archiveTarget, setArchiveTarget] = useState<Teacher | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function openArchive(t: Teacher) {
    setArchiveTarget(t);
    setArchiveReason("");
    setArchiveError(null);
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    setArchiveError(null);
    const res = await fetch(`/api/staff/${archiveTarget.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: archiveReason.trim() || undefined }),
    });
    const data = await res.json();
    setArchiveLoading(false);
    if (!res.ok) { setArchiveError(data.error || "Couldn't archive staff member."); return; }
    setArchiveTarget(null);
    load();
  }

  function roleLabel(t: Teacher): { label: string; variant: "teacher" | "staff" | "none" } {
    if (!t.user) return { label: "No account", variant: "none" };
    if (t.user.mustChangePassword) return { label: "Never logged in", variant: "none" };
    if (t.user.role === "PRINCIPAL") return { label: "Principal", variant: "staff" };
    if (t.user.staffRole) return { label: t.user.staffRole.name, variant: "staff" };
    return { label: "Teacher", variant: "teacher" };
  }

  const q = search.trim().toLowerCase();
  const visibleTeachers = (teachers ?? []).filter((t) => {
    if (q && !t.fullName.toLowerCase().includes(q) &&
        !t.staffId.toLowerCase().includes(q) &&
        !t.teacherSubjects.some(ts => ts.subject.code.toLowerCase().includes(q))) return false;
    if (filterDept && t.primaryDepartment?.id !== filterDept) return false;
    return true;
  });

  return (
    <div>
      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search by name, staff ID, or subject…" />
        <WorkspaceToolbar.Filter
          label="Department" value={filterDept}
          options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          onChange={setFilterDept}
        />
        {(search || filterDept) && (
          <button type="button" className="text-sm text-teal hover:text-teal/80 transition-colors"
            onClick={() => { setSearch(""); setFilterDept(""); }}>Clear filters</button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount count={visibleTeachers.length} total={teachers?.length} label="staff member" />
          <button className={primaryButtonClass} onClick={openCreate}>
            <UserPlus className="h-4 w-4" />Register staff
          </button>
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loginCreated && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-success-bg border border-success/20 px-5 py-4 text-sm text-success">
          <div className="flex-1">
            <p className="font-semibold mb-0.5">Login created for {loginCreated.email}</p>
            <p>
              Their initial password is the <strong>school username</strong>. They will be prompted to set
              a personal password on first login.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLoginCreated(null)}
            className="opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {teachers === null ? (
        <SkeletonTable rows={6} cols={7} hasAvatar />
      ) : teachers.length === 0 ? (
        <EmptyState message="No staff registered yet." />
      ) : visibleTeachers.length === 0 ? (
        <EmptyState message="No staff match your search." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5 w-[220px]">Staff member</th>
                  <th className="px-5 py-3.5 w-[100px]">Staff ID</th>
                  <th className="px-5 py-3.5 w-[130px]">Role</th>
                  <th className="px-5 py-3.5 hidden md:table-cell">Department</th>
                  <th className="px-5 py-3.5 hidden lg:table-cell">Subjects</th>
                  <th className="px-5 py-3.5 hidden lg:table-cell">Class teacher</th>
                  <th className="px-5 py-3.5 w-[80px]" />
                </tr>
              </thead>
              <tbody>
                {visibleTeachers.map((t) => {
                  const { label, variant } = roleLabel(t);
                  return (
                    <tr key={t.id} className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openStaffDrawer(t.id)}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={t.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink group-hover:text-teal transition-colors truncate">{t.fullName}</p>
                            {t.email && <p className="text-xs text-slate/70 truncate">{t.email}</p>}
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-slate/30 group-hover:text-teal transition-colors shrink-0 ml-auto mr-1" />
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">{t.staffId}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <RoleBadge label={label} variant={variant} />
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                        {t.primaryDepartment
                          ? <button type="button" onClick={() => openDeptDrawer(t.primaryDepartment!.id)} className="inline-flex"><Chip variant="default" size="xs" className="hover:bg-teal-50 hover:text-teal hover:border-teal/30 transition-colors cursor-pointer">{t.primaryDepartment.name}</Chip></button>
                          : <span className="text-xs text-slate/50">—</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        {t.teacherSubjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.teacherSubjects.slice(0, 4).map(ts => (
                              <button key={ts.subject.id} type="button" onClick={() => openSubjDrawer(ts.subject.id)} className="inline-flex">
                                <Chip variant="teal" size="xs" className="hover:bg-teal/20 cursor-pointer">{ts.subject.code}</Chip>
                              </button>
                            ))}
                            {t.teacherSubjects.length > 4 && (
                              <Chip variant="default" size="xs">+{t.teacherSubjects.length - 4}</Chip>
                            )}
                          </div>
                        ) : <span className="text-xs text-slate/50">—</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        {t.classTeacherOf
                          ? <button type="button" onClick={() => openClassDrawer(t.classTeacherOf!.id)} className="inline-flex"><Chip variant="info" size="xs" className="hover:opacity-80 cursor-pointer">{t.classTeacherOf.name}</Chip></button>
                          : <span className="text-xs text-slate/50">—</span>}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ActionIconButton icon={<Pencil className="h-4 w-4" />} label="Edit staff" onClick={() => openEdit(t)} />
                          <ActionIconButton icon={<UserMinus className="h-4 w-4" />} label="Transfer staff" variant="danger" onClick={() => openArchive(t)} />
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

      {modalOpen && (
        <Modal
          title={editing ? "Edit staff member" : "Register staff"}
          description={
            editing
              ? "Update this staff member's details, role, and subject assignments."
              : "Add a new member of staff to the school register."
          }
          onClose={() => { clearStaffDraft(); setModalOpen(false); setSubmitting(false); }}
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}

            {/* ── Identity ── */}
            <div className="form-section">
              <div className="form-section-title">Identity</div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full name <span className="text-danger">*</span></label>
                    <input name="fullName" required defaultValue={editing?.fullName} className={inputClass} placeholder="e.g. Jane Muthoni" />
                  </div>
                  <div>
                    <label className={labelClass}>Staff ID</label>
                    {!editing && nextStaffId === null ? (
                      <div className="h-10 rounded-lg bg-line/40 animate-pulse" />
                    ) : !editing && nextStaffId === "" ? (
                      <>
                        <input name="startingStaffId" type="number" min="1" required placeholder="e.g. 1" className={inputClass} />
                        <p className="text-xs text-slate mt-1.5">First staff member — enter a starting number.</p>
                      </>
                    ) : (
                      <>
                        <input
                          name="staffId"
                          required={!!editing}
                          disabled={!!editing}
                          defaultValue={editing?.staffId ?? nextStaffId ?? ""}
                          className={`${inputClass} ${editing ? "bg-paper text-slate cursor-not-allowed" : ""}`}
                        />
                        {!editing && <p className="text-xs text-slate mt-1.5">Auto-assigned — edit if needed.</p>}
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Role</label>
                  <select value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)} className={inputClass}>
                    <option value={TEACHING_STAFF}>Teaching Staff</option>
                    {staffRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {!isTeaching && (
                    <p className="text-xs text-slate mt-1.5">
                      Access is controlled by this role&apos;s permissions — configure them in Roles &amp; Permissions.
                    </p>
                  )}
                </div>


              </div>
            </div>

            {/* ── Contact ── */}
            <div className="form-section">
              <div className="form-section-title">Contact</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Email <span className="text-danger">*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editing?.email || ""}
                    className={inputClass}
                    placeholder="e.g. jane@school.ac.ke"
                  />
                  <p className="text-xs text-slate mt-1.5">Required to create a login account.</p>
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input name="phone" defaultValue={editing?.phone || ""} className={inputClass} placeholder="e.g. 0712 345 678" />
                </div>
              </div>
            </div>

            {/* ── Teaching-staff-only fields ── */}
            {isTeaching && (
              <>
                <div className="form-section">
                  <div className="form-section-title">Teaching Details</div>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Subjects taught</label>
                      <p className="text-xs text-slate mb-2">Select all subjects this teacher can deliver.</p>
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto rounded-lg border border-line p-3 bg-paper/40">
                        {subjects.length === 0 && (
                          <p className="text-xs text-slate p-1">No subjects configured yet.</p>
                        )}
                        {subjects.map((s) => {
                          const sel = selectedSubjects.includes(s.id);
                          return (
                            <button
                              type="button"
                              key={s.id}
                              onClick={() => toggleSubject(s.id)}
                              className={`inline-flex items-center gap-1.5 text-sm rounded-lg border px-2.5 py-1 min-h-[44px] sm:min-h-0 font-medium transition-all duration-100 ${
                                sel
                                  ? "bg-teal text-white border-teal shadow-xs"
                                  : "border-line text-ink hover:border-teal/40 hover:bg-teal-50/50"
                              }`}
                            >
                              {sel && (
                                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                                  <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                                </svg>
                              )}
                              {s.code}
                            </button>
                          );
                        })}
                      </div>
                      {selectedSubjects.length > 0 && (
                        <p className="text-xs text-teal mt-1.5 font-medium">
                          {selectedSubjects.length} subject{selectedSubjects.length !== 1 ? "s" : ""} selected
                        </p>
                      )}
                    </div>

                    {/* Department is derived automatically from the selected subjects */}
                    {(() => {
                      const deptNames = [
                        ...new Set(
                          selectedSubjects
                            .map((sid) => subjects.find((s) => s.id === sid)?.department?.name ?? null)
                            .filter(Boolean)
                        ),
                      ] as string[];
                      return deptNames.length > 0 ? (
                        <div>
                          <label className={labelClass}>Department</label>
                          <p className={`${inputClass} bg-paper text-slate cursor-default`}>
                            {deptNames.join(", ")}
                          </p>
                          <p className="text-xs text-slate mt-1.5">
                            Auto-assigned from the subjects above.
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Options</div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          name="todEligible"
                          defaultChecked={editing ? editing.todEligible : true}
                          className="sr-only peer"
                        />
                        <div className="h-5 w-9 rounded-full bg-line peer-checked:bg-teal transition-colors" />
                        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">Eligible for Teacher on Duty</p>
                        <p className="text-xs text-slate mt-0.5">Include in automated TOD scheduling rotation.</p>
                      </div>
                    </label>

                    {!editing && (
                      <div className="flex items-center gap-2.5 rounded-lg bg-info-bg border border-info/20 text-info text-xs px-3.5 py-3">
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        <span>Login credentials are created automatically for all teachers using the email above.</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Form actions — inside the form so they work on mobile */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className={secondaryButtonClass} onClick={() => { clearStaffDraft(); setModalOpen(false); setSubmitting(false); }}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass} disabled={submitting}>
                {submitting ? (editing ? "Saving…" : "Registering…") : (editing ? "Save changes" : "Register staff")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Transfer Staff Dialog ── */}
      {archiveTarget && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm
                     flex items-end sm:items-center justify-center
                     px-0 sm:px-4"
          onClick={(e) => { if (e.currentTarget === e.target) setArchiveTarget(null); }}
        >
          <div
            className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl
                       border border-line shadow-xl flex flex-col max-h-[92dvh] modal-content"
            role="dialog" aria-modal="true" aria-labelledby="transfer-staff-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-line" aria-hidden="true" />
            </div>
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-line shrink-0">
              <div>
                <h2 id="transfer-staff-title" className="text-base font-semibold text-ink">Transfer Staff Member</h2>
                <p className="mt-1 text-sm text-slate">
                  <span className="font-medium text-ink">{archiveTarget.fullName}</span>
                  {" · "}
                  <span className="font-mono text-xs">ID {archiveTarget.staffId}</span>
                </p>
              </div>
              <button type="button" onClick={() => setArchiveTarget(null)} aria-label="Close"
                className="flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-lg
                           text-slate hover:text-ink hover:bg-paper transition-colors shrink-0 -mr-2 -mt-1">
                <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 space-y-4">
              {archiveError && <ErrorBanner message={archiveError} onDismiss={() => setArchiveError(null)} />}
              <p className="text-sm text-slate leading-relaxed">
                This staff member will be removed from the active directory and moved to the
                History module. All associated records are permanently preserved.
                The staff ID <span className="font-mono font-medium">{archiveTarget.staffId}</span> will
                be released for reuse when registering new staff.
              </p>
              <div>
                <label htmlFor="archive-reason" className={labelClass}>
                  Reason for leaving <span className="text-slate text-xs font-normal">(optional)</span>
                </label>
                <textarea
                  id="archive-reason"
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Resignation, retirement, contract end…"
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-line bg-paper px-6 py-4 rounded-b-2xl">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={archiveLoading}
                  className={secondaryButtonClass}
                  onClick={() => setArchiveTarget(null)}>
                  Cancel
                </button>
                <button type="button" disabled={archiveLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg
                             bg-amber-500 text-white text-sm font-medium px-4 py-2.5
                             min-h-[44px] sm:min-h-0
                             hover:bg-amber-600 active:scale-[0.98] transition-all duration-100
                             disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                  onClick={handleArchiveConfirm}>
                  {archiveLoading ? "Transferring…" : "Confirm Transfer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Entity drawers — intelligent cross-navigation ── */}
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
function RolesTab() {
  const [roles, setRoles]           = useState<FullRole[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Record<string, { canView: boolean; canManage: boolean }>>({});
  const [dirty, setDirty]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load(selectAfter?: string) {
    const res  = await fetch("/api/staff-roles");
    const data: FullRole[] = await res.json();
    setRoles(data);
    const next = selectAfter ?? selectedId ?? data[0]?.id ?? null;
    setSelectedId(next);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = roles?.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    if (!selected) { setDraftPerms({}); return; }
    const map: Record<string, { canView: boolean; canManage: boolean }> = {};
    for (const p of selected.permissions) map[p.module] = { canView: p.canView, canManage: p.canManage };
    setDraftPerms(map); setDirty(false); setError(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPerm(module: string, key: "canView" | "canManage", value: boolean) {
    setDraftPerms((prev) => {
      const cur  = prev[module] || { canView: false, canManage: false };
      const next = { ...cur, [key]: value };
      if (key === "canManage" && value)  next.canView   = true;
      if (key === "canView"   && !value) next.canManage = false;
      return { ...prev, [module]: next };
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true); setError(null);
    const permissions = Object.entries(draftPerms)
      .filter(([, v]) => v.canView || v.canManage)
      .map(([module, v]) => ({ module, canView: v.canView, canManage: v.canManage }));
    const res  = await fetch(`/api/staff-roles/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions }) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || "Couldn't save permissions."); return; }
    setDirty(false); load(selected.id);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const form = new FormData(e.currentTarget);
    const res  = await fetch("/api/staff-roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description") || "" }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Couldn't create role."); return; }
    setCreateOpen(false); load(data.id);
  }

  async function handleDeleteRole(role: FullRole) {
    const count = role.totalUsers ?? role._count.users;
    if (count > 0) { alert(`${count} staff member(s) still have this role. Reassign them first.`); return; }
    if (!confirm(`Delete the "${role.name}" role? This can't be undone.`)) return;
    const res = await fetch(`/api/staff-roles/${role.id}`, { method: "DELETE" });
    if (!res.ok) { const data = await res.json(); alert(data.error || "Couldn't delete."); return; }
    setSelectedId(null); load();
  }

  return (
    <div>
      <WorkspaceToolbar>
        <WorkspaceToolbar.Actions>
          <p className="text-sm text-slate">Define roles and control exactly what each can see and manage.</p>
          <button className={royalButtonClass} onClick={() => setCreateOpen(true)}>New role</button>
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {roles === null ? (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm" aria-busy="true">
            <tbody>{Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-5 py-4"><div className="h-3 rounded-md bg-slate-100 animate-pulse w-28" /></td>
                <td className="px-5 py-4"><div className="h-3 rounded-md bg-slate-100 animate-pulse w-16" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : roles.length === 0 ? (
        <EmptyState message="No staff roles yet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
          {/* Role list */}
          <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
            {roles.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3.5 border-b border-line last:border-0 transition-colors ${r.id === selectedId ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                <p className={`text-sm font-semibold ${r.id === selectedId ? "text-teal" : "text-ink"}`}>{r.name}</p>
                <p className="text-xs text-slate mt-0.5">{r.totalUsers ?? r._count.users} {(r.totalUsers ?? r._count.users) === 1 ? "person" : "people"}</p>
              </button>
            ))}
          </div>

          {selected && (
            <div className={`${royalCardClass} p-5`}>
              {error && <ErrorBanner message={error} />}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-ink">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-slate mt-0.5 leading-relaxed">{selected.description}</p>
                  )}
                  <p className="text-xs text-slate mt-1">
                    {selected.totalUsers ?? selected._count.users} {(selected.totalUsers ?? selected._count.users) === 1 ? "person" : "people"} with this role
                  </p>
                </div>
                <button className={dangerLinkClass} onClick={() => handleDeleteRole(selected)}>
                  Delete role
                </button>
              </div>

              <div className="bg-white border border-line rounded-xl overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_80px_80px] border-b border-line bg-paper/60 px-5 py-3">
                  <p className="text-xs font-semibold text-slate uppercase tracking-wide">Module</p>
                  <p className="text-xs font-semibold text-slate uppercase tracking-wide text-center">View</p>
                  <p className="text-xs font-semibold text-slate uppercase tracking-wide text-center">Manage</p>
                </div>
                <div className="divide-y divide-line">
                  {ASSIGNABLE_MODULES.map((m) => {
                    const info = MODULE_INFO[m];
                    const perm = draftPerms[m] || { canView: false, canManage: false };
                    return (
                      <div
                        key={m}
                        className={`grid grid-cols-[1fr_80px_80px] px-5 py-3.5 items-center transition-colors ${
                          perm.canView || perm.canManage ? "bg-teal-50/30" : "hover:bg-paper/60"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{info.label}</p>
                          <p className="text-xs text-slate/70 mt-0.5">{info.description}</p>
                        </div>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={perm.canView}
                            onClick={() => setPerm(m, "canView", !perm.canView)}
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all duration-100 ${
                              perm.canView
                                ? "bg-teal border-teal"
                                : "border-line hover:border-teal/50"
                            }`}
                          >
                            {perm.canView && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={perm.canManage}
                            onClick={() => setPerm(m, "canManage", !perm.canManage)}
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all duration-100 ${
                              perm.canManage
                                ? "bg-teal border-teal"
                                : "border-line hover:border-teal/50"
                            }`}
                          >
                            {perm.canManage && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 mt-1">
                {dirty ? (
                  <p className="text-xs text-warn font-medium flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-warn inline-block" />
                    Unsaved changes
                  </p>
                ) : (
                  <p className="text-xs text-slate">Permissions are saved per role.</p>
                )}
                <button
                  className={royalButtonClass}
                  disabled={!dirty || saving}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : "Save permissions"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <Modal
          title="New staff role"
          description="Define a named role. You'll assign module permissions right after creating it."
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <div className="form-section">
              <div className="form-section-title">Role Details</div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Role name <span className="text-danger">*</span></label>
                  <input
                    name="name"
                    required
                    placeholder="e.g. Accountant, Librarian"
                    className={inputClass}
                    autoFocus
                  />
                  <p className="text-xs text-slate mt-1.5">
                    Staff members see this label next to their name.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Description (optional)</label>
                  <input
                    name="description"
                    placeholder="Brief note about what this role does"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Form actions — inside the form so they work on mobile */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className={secondaryButtonClass} onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={royalButtonClass}>
                Create role
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const [tab, setTab] = useState<"directory" | "roles">("directory");

  return (
    <div>
      <ContextNavigation items={[{ href: "/principal/students", label: "Students" }, { href: "/principal/staff", label: "Staff" }]} />
      <PageHeader title="Staff" description="Register teaching and non-teaching staff, assign roles, and control what each can access." />
      <TabBar active={tab} onChange={setTab} />
      {tab === "directory" ? <DirectoryTab /> : <RolesTab />}
    </div>
  );
}
