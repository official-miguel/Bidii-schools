"use client";

/**
 * StaffProfileDrawer
 *
 * Slide-over workspace that opens when a user clicks any staff member
 * anywhere in the system. Fetches full staff data on open and renders:
 *  - Bio (name, ID, email, phone, login status)
 *  - Role & department
 *  - Subjects taught
 *  - Class teacher assignment (clickable → DepartmentWorkspaceDrawer chain)
 *  - Quick navigation links
 *
 * Cross-navigation props allow the parent to open related entity drawers
 * (e.g. clicking a department chip from within this drawer).
 */

import { useEffect, useState, useRef, useCallback } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import {
  Mail, Phone, BookOpen, Users, Building2,
  ShieldCheck, Shield, ExternalLink, CheckCircle2, XCircle,
  Search, X as XIcon, ShieldPlus, KeyRound, Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffDetail {
  id: string;
  fullName: string;
  staffId: string;
  email: string | null;
  phone: string | null;
  todEligible: boolean;
  designation: string | null;
  primaryDepartment: { id: string; name: string } | null;
  classTeacherOf: { id: string; name: string } | null;
  teacherSubjects: { subject: { id: string; name: string; code: string } }[];
  user: {
    id: string;
    email: string;
    isActive: boolean;
    role: string;
    mustChangePassword: boolean;
    staffRole: { id: string; name: string } | null;
    userStaffRoles: { staffRole: { id: string; name: string; description: string | null } }[];
  } | null;
}

interface Props {
  staffId: string | null;
  open: boolean;
  onClose: () => void;
  /** Called when user clicks a department chip — lets parent open DeptDrawer */
  onOpenDepartment?: (deptId: string, deptName: string) => void;
  /** Called when user clicks a class name — lets parent open ClassDrawer */
  onOpenClass?: (classId: string, className: string) => void;
  /** Base navigation path, e.g. "/principal" */
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleBadge(staff: StaffDetail): { label: string; variant: "teal" | "info" | "default" | "warn" } {
  if (!staff.user) return { label: "No account", variant: "default" };
  if (staff.user.mustChangePassword) return { label: "Never logged in", variant: "warn" };
  if (staff.user.role === "PRINCIPAL") return { label: "Principal", variant: "info" };
  if (staff.user.staffRole) return { label: staff.user.staffRole.name, variant: "info" };
  return { label: "Teacher", variant: "teal" };
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-paper border border-line shrink-0 mt-0.5">
        <span className="text-slate">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate uppercase tracking-wide mb-0.5">
          {label}
        </p>
        <div className="text-sm text-ink">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProvisionLoginCard — shown when the teacher has no login account (imported)
// ---------------------------------------------------------------------------

function ProvisionLoginCard({
  staff,
  onMutate,
}: {
  staff: StaffDetail;
  onMutate: () => void;
}) {
  const [email,   setEmail]   = useState(staff.email ?? "");
  const [role,    setRole]    = useState<"TEACHER" | "ADMIN_STAFF">("TEACHER");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleCreate() {
    setError(null);
    const trimEmail = email.trim();
    if (!trimEmail) { setError("Enter an email address for this account."); return; }

    setBusy(true);
    try {
      const res  = await fetch(`/api/staff/${staff.id}/provision-login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimEmail, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create login."); return; }
      setSuccess(true);
      setTimeout(() => onMutate(), 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 shrink-0">
          <KeyRound className="h-4 w-4 text-amber-600" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-900">No login account</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            This staff member was imported and has no login credentials yet.
            Create an account so they can sign in.
          </p>
        </div>
      </div>

      {success ? (
        <div className="flex items-center gap-2 rounded-lg bg-success-bg border border-success/20 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <p className="text-sm text-success font-medium">
            Login created. Initial password is the school username.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-amber-900 mb-1">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="staff@school.com"
                className="w-full rounded-lg border border-amber-200 bg-white pl-9 pr-3 py-2 text-sm
                           text-ink placeholder:text-slate/40
                           focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30
                           transition-colors"
              />
            </div>
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-xs font-medium text-amber-900 mb-1">
              Login type
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "TEACHER" | "ADMIN_STAFF")}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm
                         text-ink focus:outline-none focus:border-amber-400 focus:ring-2
                         focus:ring-amber-300/30 transition-colors"
            >
              <option value="TEACHER">Teacher (teaching staff)</option>
              <option value="ADMIN_STAFF">Admin staff (non-teaching)</option>
            </select>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-danger-bg border border-danger/20 px-3 py-2">
              <XCircle className="h-3.5 w-3.5 text-danger shrink-0" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {/* Action */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg
                       bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold
                       py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
              : <><KeyRound className="h-4 w-4" />Create login account</>
            }
          </button>

          <p className="text-[11px] text-amber-600 text-center">
            Initial password will be the school username. They&apos;ll be prompted to change it on first login.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoleAssignmentCard — dropdown to assign StaffRoles from the teacher profile
// ---------------------------------------------------------------------------

interface RoleSearchResult {
  id: string;
  name: string;
  description: string | null;
}

function RoleAssignmentCard({
  staff,
  onMutate,
}: {
  staff: StaffDetail;
  onMutate: () => void;
}) {
  const userId   = staff.user?.id ?? null;
  const assigned = staff.user?.userStaffRoles.map((r) => r.staffRole) ?? [];

  // All school roles — fetched once when card mounts
  const [allRoles,  setAllRoles]  = useState<RoleSearchResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  // Controls whether the dropdown list is visible
  const [open,      setOpen]      = useState(false);
  // Filter text typed inside the trigger button area
  const [filter,    setFilter]    = useState("");
  const [busy,      setBusy]      = useState<string | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const assignedIds = new Set(assigned.map((r) => r.id));

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch all roles once
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch("/api/staff-roles")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAllRoles(
            data.map((r: { id: string; name: string; description?: string | null }) => ({
              id: r.id, name: r.name, description: r.description ?? null,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = filter.trim()
    ? allRoles.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    : allRoles;

  // Unassigned roles shown in the dropdown (already-assigned ones are shown
  // in the chips above and can be removed from there)
  const available = filtered.filter((r) => !assignedIds.has(r.id));

  async function toggle(roleId: string, currentlyAssigned: boolean) {
    if (!userId) return;
    setBusy(roleId);
    try {
      const res = await fetch(`/api/staff-roles/${roleId}/assign`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId, assign: !currentlyAssigned }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(json.error ?? "Failed.", false); return; }
      showToast(currentlyAssigned ? "Role removed." : "Role assigned.", true);
      setOpen(false);
      setFilter("");
      onMutate();
    } finally {
      setBusy(null);
    }
  }

  if (!userId) return null;

  return (
    <div className="bg-white border border-line rounded-xl p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldPlus className="h-4 w-4 text-teal" />
        <h3 className="text-xs font-semibold text-slate uppercase tracking-wide">
          Additional roles
        </h3>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium
          ${toast.ok
            ? "bg-success-bg text-success border border-success/20"
            : "bg-danger-bg text-danger border border-danger/20"}`}>
          {toast.msg}
        </div>
      )}

      {/* Assigned role chips */}
      {assigned.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((role) => (
            <span key={role.id}
              className="inline-flex items-center gap-1 rounded-full
                         bg-teal/10 border border-teal/20 text-teal
                         pl-2.5 pr-1 py-0.5 text-xs font-medium">
              {role.name}
              <button
                onClick={() => toggle(role.id, true)}
                disabled={busy === role.id}
                title="Remove role"
                className="flex items-center justify-center w-4 h-4 rounded-full
                           hover:bg-danger/20 hover:text-danger transition-colors
                           disabled:opacity-40">
                {busy === role.id
                  ? <span className="text-[10px] leading-none">…</span>
                  : <XIcon className="h-3 w-3" />}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger + list */}
      <div ref={containerRef} className="relative">
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setFilter(""); }}
          disabled={loading || allRoles.length === 0}
          className="w-full flex items-center justify-between gap-2 h-9 px-3
                     rounded-lg border border-line text-sm bg-paper
                     hover:border-teal/40 focus:outline-none focus:ring-2 focus:ring-teal/30
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <span className="text-slate/60 text-sm">
            {loading ? "Loading roles…" : "Assign a role…"}
          </span>
          <Search className="h-3.5 w-3.5 text-slate/40 shrink-0" />
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50
                          bg-white border border-line rounded-xl shadow-lg
                          overflow-hidden">
            {/* Inline filter input */}
            <div className="px-2 pt-2 pb-1 border-b border-line">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5
                                   text-slate/40 pointer-events-none" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter roles…"
                  className="w-full h-8 pl-8 pr-3 text-sm text-ink bg-paper rounded-lg
                             border border-line focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
                {filter && (
                  <button onClick={() => setFilter("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable role list — max 5 rows visible */}
            <div className="overflow-y-auto max-h-[220px]">
              {available.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate text-center">
                  {filter ? `No roles match "${filter}"` : "All roles already assigned"}
                </p>
              ) : (
                available.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggle(role.id, false)}
                    disabled={busy === role.id}
                    className="w-full flex items-start gap-3 px-4 py-2.5 text-left
                               border-b border-line/50 last:border-0
                               hover:bg-teal-50/50 transition-colors disabled:opacity-40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{role.name}</p>
                      {role.description && (
                        <p className="text-[10px] text-slate truncate mt-0.5">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-teal mt-0.5">
                      {busy === role.id ? "…" : "Assign"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {assigned.length === 0 && allRoles.length > 0 && (
        <p className="text-[11px] text-slate/55">
          Assign a role to grant extra module access on top of this
          teacher&apos;s built-in class and subject permissions.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StaffProfileDrawer({
  staffId,
  open,
  onClose,
  onOpenDepartment,
  onOpenClass,
  basePath = "/principal",
}: Props) {
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchStaff() {
    if (!staffId) return;
    setError(null);
    setLoading(true);
    fetch(`/api/staff/${staffId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStaff(d);
      })
      .catch((e) => setError(e.message || "Couldn't load staff profile."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open || !staffId) return;
    setStaff(null);
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffId]);

  const { label: roleLabel, variant: roleVariant } = staff ? roleBadge(staff) : { label: "", variant: "default" as const };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={staff?.fullName ?? "Staff profile"}
      description={staff ? `Staff ID: ${staff.staffId}` : undefined}
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
          <XCircle className="h-4 w-4 text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {staff && !loading && (
        <div className="space-y-5">
          {/* ── Identity card ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-start gap-4 mb-4">
              <Avatar name={staff.fullName} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-ink leading-tight">{staff.fullName}</h2>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Chip variant={roleVariant as "teal" | "info" | "default"} size="xs">
                    {roleVariant === "teal" && <ShieldCheck className="h-3 w-3" />}
                    {roleLabel}
                  </Chip>
                  {staff.todEligible && (
                    <Chip variant="default" size="xs">TOD eligible</Chip>
                  )}
                  {staff.user && (
                    <Chip variant={staff.user.isActive ? "success" : "danger"} size="xs">
                      {staff.user.isActive ? "Active" : "Inactive"}
                    </Chip>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <InfoRow
                icon={<Shield className="h-3.5 w-3.5" />}
                label="Staff ID"
                value={
                  <span className="font-mono text-sm bg-paper border border-line rounded px-1.5 py-0.5">
                    {staff.staffId}
                  </span>
                }
              />

              {staff.designation && (
                <InfoRow
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Designation"
                  value={
                    <span className="inline-flex items-center rounded-full bg-teal/10 text-teal text-xs font-medium px-2.5 py-0.5">
                      {staff.designation}
                    </span>
                  }
                />
              )}

              {staff.email && (
                <InfoRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={
                    <a href={`mailto:${staff.email}`} className="text-teal hover:underline">
                      {staff.email}
                    </a>
                  }
                />
              )}

              {staff.phone && (
                <InfoRow
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={
                    <a href={`tel:${staff.phone}`} className="text-teal hover:underline">
                      {staff.phone}
                    </a>
                  }
                />
              )}

              {staff.primaryDepartment && (
                <InfoRow
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Department"
                  value={
                    onOpenDepartment ? (
                      <button
                        type="button"
                        onClick={() => onOpenDepartment(staff.primaryDepartment!.id, staff.primaryDepartment!.name)}
                        className="inline-flex items-center gap-1 text-teal hover:underline font-medium"
                      >
                        {staff.primaryDepartment.name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span>{staff.primaryDepartment.name}</span>
                    )
                  }
                />
              )}

              {staff.classTeacherOf && (
                <InfoRow
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Class teacher of"
                  value={
                    onOpenClass ? (
                      <button
                        type="button"
                        onClick={() => onOpenClass(staff.classTeacherOf!.id, staff.classTeacherOf!.name)}
                        className="inline-flex items-center gap-1 text-teal hover:underline font-medium"
                      >
                        {staff.classTeacherOf.name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span>{staff.classTeacherOf.name}</span>
                    )
                  }
                />
              )}
            </div>
          </div>

          {/* ── Provision login (imported staff with no account) ── */}
          {!staff.user && (
            <ProvisionLoginCard staff={staff} onMutate={fetchStaff} />
          )}

          {/* ── Login status ── */}
          {staff.user && (
            <div className="bg-white border border-line rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
                Login account
              </h3>
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  staff.user.isActive ? "bg-success-bg" : "bg-danger-bg"
                }`}>
                  {staff.user.isActive
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <XCircle     className="h-4 w-4 text-danger" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{staff.user.email}</p>
                  <p className="text-xs text-slate">
                    {staff.user.isActive ? "Active account" : "Account deactivated"}{" "}
                    · {staff.user.role === "PRINCIPAL" ? "Principal" : staff.user.role === "TEACHER" ? "Teacher login" : "Staff login"}
                  </p>
                </div>
              </div>
              {staff.user.mustChangePassword && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-3 py-2">
                  <p className="text-xs text-warn leading-relaxed">
                    This staff member has not yet completed their first login. Their temporary password is still active.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Subjects ── */}
          {staff.teacherSubjects.length > 0 && (
            <div className="bg-white border border-line rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Subjects taught
                </div>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {staff.teacherSubjects.map(({ subject }) => (
                  <Chip key={subject.id} variant="teal" size="sm">
                    <span className="font-mono font-bold">{subject.code}</span>
                    <span className="text-teal/70 text-[10px] ml-1">{subject.name}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* ── Role assignment (principal only) ── */}
          {staff.user && (
            <RoleAssignmentCard staff={staff} onMutate={fetchStaff} />
          )}
          {/* ── Quick links ── */}
          <div className="bg-white border border-line rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
              Quick links
            </h3>
            <div className="space-y-2">
              <a
                href={`${basePath}/staff`}
                className="flex items-center gap-2 text-sm text-teal hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View full staff directory
              </a>
              {staff.classTeacherOf && (
                <a
                  href={`${basePath}/timetable?classId=${staff.classTeacherOf.id}`}
                  className="flex items-center gap-2 text-sm text-teal hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View class timetable
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
