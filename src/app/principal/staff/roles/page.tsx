"use client";

import { useEffect, useState, FormEvent } from "react";
import Modal from "@/components/Modal";
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  inputClass,
  labelClass,
  secondaryButtonClass,
  dangerLinkClass,
  royalButtonClass,
  royalCardClass,
} from "@/components/ui";
import { SkeletonTableRow } from "@/components/ui/ProgressivePage";

type Permission = { module: string; canView: boolean; canManage: boolean };
type StaffRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  _count: { users: number };
  // totalUsers is the combined legacy + multi-role count returned by the API
  totalUsers?: number;
};

const MODULE_INFO: Record<string, { label: string; description: string }> = {
  DEPARTMENTS: { label: "Departments", description: "Subject departments and heads" },
  SUBJECTS: { label: "Subjects", description: "The school's subject list" },
  STAFF: { label: "Staff", description: "Teaching and non-teaching staff records" },
  STAFF_ROLES: { label: "Staff Roles & Permissions", description: "Principal only, always" },
  CLASSES: { label: "Classes", description: "Classes and streams" },
  STUDENTS: { label: "Students", description: "Student records" },
  TIMETABLE: { label: "Timetable", description: "The weekly timetable" },
  EXAM_PERIODS: { label: "Exam Periods", description: "Exam sittings" },
  RESULTS: { label: "Results", description: "Results and slip generation" },
  TOD: { label: "Teacher on Duty", description: "Duty rosters" },
  COMMUNICATION: { label: "Communication Centre", description: "Messages to staff/parents" },
  CALENDAR: { label: "School Calendar", description: "The school calendar" },
  AI_TOOLS: { label: "AI Tools", description: "AI-assisted scheduling and insights" },
  REPORTS: { label: "Reports", description: "End-of-term and analytics reports" },
  RECORDS_DISCIPLINE: { label: "Records — Discipline", description: "Discipline cases, files, AI summaries, print/export" },
  RECORDS_ACHIEVEMENTS: { label: "Records — Achievements", description: "Achievements, shared achievements, files, AI summaries" },
  FEES:                 { label: "Fees Management",         description: "Fee structures, invoicing, payments, and debtor tracking" },
};

// STAFF_ROLES itself is deliberately not offered here — only the Principal
// can define roles and permissions, so it's never a checkbox a Principal can
// hand to someone else.
const ASSIGNABLE_MODULES = Object.keys(MODULE_INFO).filter((m) => m !== "STAFF_ROLES");

export default function StaffRolesPage() {
  const [roles, setRoles] = useState<StaffRole[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Record<string, { canView: boolean; canManage: boolean }>>(
    {}
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load(selectAfter?: string) {
    const res = await fetch("/api/staff-roles");
    const data: StaffRole[] = await res.json();
    setRoles(data);
    const next = selectAfter ?? selectedId ?? data[0]?.id ?? null;
    setSelectedId(next);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = roles?.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setDraftPerms({});
      return;
    }
    const map: Record<string, { canView: boolean; canManage: boolean }> = {};
    for (const p of selected.permissions) {
      map[p.module] = { canView: p.canView, canManage: p.canManage };
    }
    setDraftPerms(map);
    setDirty(false);
    setError(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPerm(module: string, key: "canView" | "canManage", value: boolean) {
    setDraftPerms((prev) => {
      const current = prev[module] || { canView: false, canManage: false };
      const next = { ...current, [key]: value };
      // Managing a module implies being able to view it.
      if (key === "canManage" && value) next.canView = true;
      if (key === "canView" && !value) next.canManage = false;
      return { ...prev, [module]: next };
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const permissions = Object.entries(draftPerms)
      .filter(([, v]) => v.canView || v.canManage)
      .map(([module, v]) => ({ module, canView: v.canView, canManage: v.canManage }));

    const res = await fetch(`/api/staff-roles/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Couldn't save permissions.");
      return;
    }
    setDirty(false);
    load(selected.id);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/staff-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't create role.");
      return;
    }
    setCreateOpen(false);
    load(data.id);
  }

  async function handleDeleteRole(role: StaffRole) {
    const count = role.totalUsers ?? role._count.users;
    if (count > 0) {
      alert(`${count} staff member(s) still have this role. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete the "${role.name}" role? This can't be undone.`)) return;
    const res = await fetch(`/api/staff-roles/${role.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Couldn't delete role.");
      return;
    }
    setSelectedId(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Staff Roles & Permissions"
        description="Define roles like Accountant, Deputy Principal, or Librarian, and choose exactly which parts of the system each can see and manage."
        action={
          <button className={royalButtonClass} onClick={() => setCreateOpen(true)}>
            New role
          </button>
        }
      />

      {roles === null ? (
        <div className="bg-card border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm" aria-busy="true" aria-label="Loading…">
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonTableRow key={i} cols={3} />
              ))}
            </tbody>
          </table>
        </div>
      ) : roles.length === 0 ? (
        <EmptyState message="No staff roles yet." />
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-5 items-start">
          {/* Role list */}
          <div className={`${royalCardClass} overflow-hidden`}>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 border-b border-line last:border-0 transition-colors ${
                  r.id === selectedId ? "bg-royal-50" : "hover:bg-royal-50/50"
                }`}
              >
                <p className={`text-sm font-medium ${r.id === selectedId ? "text-royal-dark" : "text-ink"}`}>
                  {r.name}
                </p>
                <p className="text-xs text-slate mt-0.5">
                  {(r.totalUsers ?? r._count.users)} {(r.totalUsers ?? r._count.users) === 1 ? "person" : "people"}
                </p>
              </button>
            ))}
          </div>

          {/* Permission matrix */}
          {selected && (
            <div className={`${royalCardClass} p-5`}>
              {error && <ErrorBanner message={error} />}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-slate mt-0.5">{selected.description}</p>
                  )}
                </div>
                <button className={dangerLinkClass} onClick={() => handleDeleteRole(selected)}>
                  Delete role
                </button>
              </div>

              <div className="border border-line rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-slate bg-royal-50/40">
                      <th className="px-4 py-2.5 font-medium">Module</th>
                      <th className="px-4 py-2.5 font-medium text-center w-24">View</th>
                      <th className="px-4 py-2.5 font-medium text-center w-24">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ASSIGNABLE_MODULES.map((m) => {
                      const info = MODULE_INFO[m];
                      const perm = draftPerms[m] || { canView: false, canManage: false };
                      return (
                        <tr key={m} className="border-b border-line last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="text-ink font-medium">{info.label}</p>
                            <p className="text-xs text-slate">{info.description}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-line accent-royal h-4 w-4"
                              checked={perm.canView}
                              onChange={(e) => setPerm(m, "canView", e.target.checked)}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-line accent-royal h-4 w-4"
                              checked={perm.canManage}
                              onChange={(e) => setPerm(m, "canManage", e.target.checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button className={royalButtonClass} disabled={!dirty || saving} onClick={handleSave}>
                  {saving ? "Saving…" : "Save permissions"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <Modal title="New staff role" onClose={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <div>
              <label className={labelClass}>Role name</label>
              <input name="name" required placeholder="e.g. Accountant" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Description (optional)</label>
              <input name="description" placeholder="Short note about this role" className={inputClass} />
            </div>
            <p className="text-xs text-slate">
              You&apos;ll set permissions for this role right after creating it.
            </p>
            <div className="flex justify-end gap-2 pt-2">
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
