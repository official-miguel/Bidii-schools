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

// ─── Types ────────────────────────────────────────────────────────────────────

type ModPerm  = { canView: boolean; canManage: boolean };
type Permission = { module: string; canView: boolean; canManage: boolean };
type StaffRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  _count: { users: number };
  totalUsers?: number;
};

// ─── Permission groups config ─────────────────────────────────────────────────

type GroupState = "view" | "manage" | "none" | "custom";

const PERM_GROUPS: { id: string; label: string; modules: string[]; adminSwitch?: boolean }[] = [
  { id: "fees",              label: "Fees",                modules: ["FEES"] },
  { id: "library",           label: "Library",             modules: ["LIBRARY"] },
  { id: "timetable",         label: "Timetable",           modules: ["TIMETABLE"] },
  { id: "examination",       label: "Examination",         modules: ["ASSESSMENT_FRAMEWORK", "EXAM_PERIODS", "RESULTS", "ASSESSMENTS"] },
  { id: "students-academic", label: "Students & Academic", modules: ["SUBJECTS", "CLASSES", "STUDENTS"] },
  { id: "student-life",      label: "Student Life",        modules: ["ACCOMMODATION"] },
  { id: "communication",     label: "Communication",       modules: ["COMMUNICATION", "CALENDAR"] },
  { id: "leadership",        label: "Leadership",          modules: ["AI_TOOLS", "ANALYTICS", "REPORTS", "STAFF", "DEPARTMENTS", "HISTORY"], adminSwitch: true },
];

const VIEW_PRESET:   ModPerm = { canView: true,  canManage: false };
const MANAGE_PRESET: ModPerm = { canView: true,  canManage: true  };
const NONE_PRESET:   ModPerm = { canView: false, canManage: false };

function deriveState(modules: string[], perms: Record<string, ModPerm>): GroupState {
  const states = modules.map((m) => {
    const p = perms[m] ?? NONE_PRESET;
    if (p.canView && p.canManage)   return "manage";
    if (p.canView && !p.canManage)  return "view";
    if (!p.canView && !p.canManage) return "none";
    return "custom";
  });
  const first = states[0];
  return states.every((s) => s === first) ? first : "custom";
}

function applyState(modules: string[], state: "view" | "manage" | "none"): Record<string, ModPerm> {
  const preset = state === "manage" ? MANAGE_PRESET : state === "view" ? VIEW_PRESET : NONE_PRESET;
  return Object.fromEntries(modules.map((m) => [m, { ...preset }]));
}

// ─── PermCheckbox ─────────────────────────────────────────────────────────────

function PermCheckbox({ label, checked, locked, onToggle }: {
  label: string; checked: boolean; locked: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={locked}
      onClick={locked ? undefined : onToggle}
      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all duration-100
        ${checked ? "bg-teal border-teal" : "border-border hover:border-teal/50"}
        ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {checked && (
        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
        </svg>
      )}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffRolesPage() {
  const [roles, setRoles]           = useState<StaffRole[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedPerms, setSavedPerms] = useState<Record<string, ModPerm>>({});
  const [changedModules, setChangedModules] = useState<Record<string, ModPerm>>({});
  const [groupStates, setGroupStates] = useState<Record<string, GroupState>>({});
  const [fullAdmin, setFullAdmin]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load(selectAfter?: string) {
    const res  = await fetch("/api/staff-roles");
    const data: StaffRole[] = await res.json();
    setRoles(data);
    const next = selectAfter ?? selectedId ?? data[0]?.id ?? null;
    setSelectedId(next);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = roles?.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setSavedPerms({}); setChangedModules({}); setGroupStates({}); setFullAdmin(false);
      return;
    }
    const map: Record<string, ModPerm> = {};
    for (const p of selected.permissions) map[p.module] = { canView: p.canView, canManage: p.canManage };
    setSavedPerms(map);
    setChangedModules({});
    const states = Object.fromEntries(PERM_GROUPS.map((g) => [g.id, deriveState(g.modules, map)]));
    setGroupStates(states);
    setFullAdmin(PERM_GROUPS.every((g) => deriveState(g.modules, map) === "manage"));
    setError(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyGroupChange(groupId: string, next: "view" | "manage" | "none") {
    const group = PERM_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const diff = applyState(group.modules, next);
    setGroupStates((prev) => ({ ...prev, [groupId]: next }));
    setChangedModules((prev) => ({ ...prev, ...diff }));
  }

  function handleViewToggle(groupId: string) {
    const cur = groupStates[groupId] ?? "none";
    if (cur === "manage") return;
    applyGroupChange(groupId, cur === "view" ? "none" : "view");
    setFullAdmin(false);
  }

  function handleManageToggle(groupId: string) {
    const cur = groupStates[groupId] ?? "none";
    applyGroupChange(groupId, cur === "manage" ? "view" : "manage");
    setFullAdmin(false);
  }

  function handleFullAdminToggle() {
    const next = !fullAdmin;
    setFullAdmin(next);
    const allDiff: Record<string, ModPerm> = {};
    const state = next ? "manage" : "none";
    for (const g of PERM_GROUPS) Object.assign(allDiff, applyState(g.modules, state));
    setGroupStates(Object.fromEntries(PERM_GROUPS.map((g) => [g.id, state])));
    setChangedModules((prev) => ({ ...prev, ...allDiff }));
  }

  async function handleSave() {
    if (!selected) return;
    if (Object.keys(changedModules).length === 0) return;
    setSaving(true);
    setError(null);
    const merged = { ...savedPerms, ...changedModules };
    const permissions = Object.entries(merged).map(([module, v]) => ({ module, ...v }));
    const res  = await fetch(`/api/staff-roles/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || "Couldn't save permissions."); return; }
    setChangedModules({});
    load(selected.id);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res  = await fetch("/api/staff-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), description: form.get("description") || "" }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Couldn't create role."); return; }
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

  const hasChanges = Object.keys(changedModules).length > 0;

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
        <div className="bg-card border border-border rounded-lg overflow-hidden">
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
                className={`w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${
                  r.id === selectedId ? "bg-teal-50" : "hover:bg-teal-50/50"
                }`}
              >
                <p className={`text-sm font-medium ${r.id === selectedId ? "text-teal" : "text-foreground"}`}>
                  {r.name}
                </p>
                <p className="text-xs text-slate mt-0.5">
                  {(r.totalUsers ?? r._count.users)} {(r.totalUsers ?? r._count.users) === 1 ? "person" : "people"}
                </p>
              </button>
            ))}
          </div>

          {/* Permission editor */}
          {selected && (
            <div className={`${royalCardClass} p-5 space-y-3`}>
              {error && <ErrorBanner message={error} />}

              {/* Role header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-slate mt-0.5">{selected.description}</p>
                  )}
                </div>
                <button className={dangerLinkClass} onClick={() => handleDeleteRole(selected)}>
                  Delete role
                </button>
              </div>

              {/* Column legend */}
              <div className="flex justify-end gap-8 pr-1">
                <span className="text-[11px] text-slate font-medium uppercase tracking-wide">View</span>
                <span className="text-[11px] text-slate font-medium uppercase tracking-wide">Manage</span>
              </div>

              {/* Group cards */}
              {PERM_GROUPS.map((group) => {
                const state    = groupStates[group.id] ?? "none";
                const isCustom = state === "custom";
                const isView   = state === "view" || state === "manage";
                const isManage = state === "manage";

                return (
                  <div key={group.id} className={`rounded-xl border transition-colors ${
                    isCustom   ? "border-amber-200 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10"
                    : isManage ? "border-teal/30 bg-teal/5"
                    : isView   ? "border-border bg-background"
                    :            "border-border bg-card"
                  }`}>
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{group.label}</p>
                        <p className="text-[10px] text-slate mt-0.5 truncate">{group.modules.join(" · ")}</p>
                      </div>

                      {isCustom ? (
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            ⚠ Custom — click to set
                          </span>
                          <PermCheckbox label="View"   checked={false} locked={false} onToggle={() => handleViewToggle(group.id)} />
                          <PermCheckbox label="Manage" checked={false} locked={false} onToggle={() => handleManageToggle(group.id)} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-6 shrink-0">
                          <PermCheckbox label="View"   checked={isView}   locked={isManage} onToggle={() => handleViewToggle(group.id)} />
                          <PermCheckbox label="Manage" checked={isManage} locked={false}    onToggle={() => handleManageToggle(group.id)} />
                        </div>
                      )}
                    </div>

                    {/* Full Admin Access switch — Leadership card only */}
                    {group.adminSwitch && (
                      <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border/60">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Full Admin Access</p>
                          <p className="text-[10px] text-slate mt-0.5">
                            Grants Manage across all 8 groups. Staff Roles &amp; Permissions management stays Principal-only.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={fullAdmin}
                          onClick={handleFullAdminToggle}
                          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                            fullAdmin ? "bg-teal" : "bg-slate-200 dark:bg-slate-700"
                          }`}
                        >
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                            fullAdmin ? "left-5" : "left-1"
                          }`} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-slate leading-relaxed max-w-sm">
                  Attendance, Diary &amp; Records access is granted automatically based on class/subject assignments.
                </p>
                <button
                  className={royalButtonClass}
                  disabled={!hasChanges || saving}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : hasChanges ? "Save changes" : "Saved"}
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
