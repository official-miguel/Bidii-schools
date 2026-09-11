"use client";

/**
 * PermissionMatrixClient — simplified permission editor for Principals.
 *
 * Layout: 8 grouped cards, each with two checkboxes (View / Manage) instead
 * of the old 27-module × 9-action grid.
 *
 * Key behaviours:
 *  - View / Manage map to the exact flag presets defined in permissionGroups.ts
 *  - Manage implies View (View shows checked + disabled when Manage is on)
 *  - Groups whose saved flags don't match either preset show "Custom — click
 *    to review" and are never silently normalised on save
 *  - PATCH payload only contains modules whose flags actually changed this
 *    session — untouched groups (including "Custom" ones) are not resent
 *  - "Full Admin Access" switch inside Leadership applies Manage to every
 *    module across all 8 groups (STAFF_ROLES explicitly excluded)
 *  - Assign-users panel is unchanged from the previous implementation
 */

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Save, X,
  Shield, Search, UserCheck, GraduationCap, Eye, Settings2,
  AlertTriangle, CheckCircle2, Sparkles,
} from "lucide-react";

import {
  PERMISSION_GROUPS,
  deriveGroupState,
  applyGroupState,
  type GroupState,
  type ModulePermission,
} from "./permissionGroups";

// ModulePermission is defined in permissionGroups.ts and re-exported here
// for any consumers that import it from this file.
export type { ModulePermission } from "./permissionGroups";

export interface RoleData {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Record<string, ModulePermission>;
}

export interface ModuleData {
  key: string;
  label: string;
  description: string;
  hub: string;
}

interface StaffUser {
  id: string;
  email: string;
  role: string;
  staffRoleId: string | null;
  userStaffRoles: { staffRoleId: string }[];
  teacher?: {
    fullName: string | null;
    staffId: string | null;
    classTeacherOf: { name: string } | null;
  } | null;
}

interface Props {
  roles:       RoleData[];
  modules:     ModuleData[];
  staffUsers:  StaffUser[];
  principalId: string;
  schoolId:    string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * Send the full merged permissions map to the server.
 *
 * The PATCH endpoint does a full delete-then-recreate of RolePermission rows,
 * so we must always send the complete state — not just the changed modules.
 * We merge changedModules on top of the existing saved permissions to produce
 * the full payload, ensuring untouched rows (including "Custom" ones) survive
 * exactly as they were.
 */
async function apiPatchRole(
  roleId: string,
  existingPermissions: Record<string, ModulePermission>,
  changedModules: Record<string, ModulePermission>,
  meta?: { name?: string; description?: string }
): Promise<{ ok: boolean; error?: string }> {
  // Merge: existing state + only-the-changed entries on top
  const merged = { ...existingPermissions, ...changedModules };
  const permissions = Object.entries(merged).map(([module, p]) => ({ module, ...p }));

  const body: Record<string, unknown> = { ...meta, permissions };

  const res = await fetch(`/api/staff-roles/${roleId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error ?? "Save failed." };
  }
  return { ok: true };
}

async function apiCreateRole(
  name: string, description: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/staff-roles", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name, description, permissions: [] }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error ?? "Create failed." };
  }
  return { ok: true };
}

async function apiDeleteRole(roleId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/staff-roles/${roleId}`, { method: "DELETE" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error ?? "Delete failed." };
  }
  return { ok: true };
}

// ── Helper: derive initial group state map from a role's saved permissions ────

function buildGroupStates(
  savedPerms: Record<string, ModulePermission>
): Record<string, GroupState> {
  return Object.fromEntries(
    PERMISSION_GROUPS.map((g) => [g.id, deriveGroupState(g, savedPerms)])
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PermissionMatrixClient({
  roles: initialRoles,
  staffUsers,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [roles, setRoles]                   = useState<RoleData[]>(initialRoles);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(initialRoles[0]?.id ?? null);
  const [toast, setToast]                   = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [newRoleName, setNewRoleName]        = useState("");
  const [newRoleDesc, setNewRoleDesc]        = useState("");
  const [showCreate, setShowCreate]          = useState(false);
  const [saving, setSaving]                  = useState(false);
  const [activeTab, setActiveTab]            = useState<"matrix" | "users">("matrix");

  // Per-group display state for the currently-selected role
  const [groupStates, setGroupStates]  = useState<Record<string, GroupState>>({});
  // Full admin switch (Leadership card)
  const [fullAdmin, setFullAdmin]       = useState(false);
  // Track which modules were actually changed this session (keyed by module string)
  const [changedModules, setChangedModules] = useState<Record<string, ModulePermission>>({});

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  // Re-derive group states whenever the selected role changes
  useEffect(() => {
    if (!selectedRole) return;
    setGroupStates(buildGroupStates(selectedRole.permissions));
    setChangedModules({});

    // Detect if every group is in "manage" state → pre-check fullAdmin switch
    const allManage = PERMISSION_GROUPS.every((g) => {
      const state = deriveGroupState(g, selectedRole.permissions);
      return state === "manage";
    });
    setFullAdmin(allManage);
  }, [selectedRoleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Group interaction ───────────────────────────────────────────────────────

  /**
   * Toggle View for a group.
   *  - If Manage is on, clicking View does nothing (can't remove View while Manage is on).
   *  - If View is on (and Manage is off), clicking unchecks → "none".
   *  - If neither is on, clicking View → "view".
   */
  function handleViewToggle(groupId: string) {
    const current = groupStates[groupId] ?? "none";
    if (current === "manage") return; // View is locked while Manage is on
    const next: GroupState = current === "view" ? "none" : "view";
    applyGroupChange(groupId, next);
  }

  /**
   * Toggle Manage for a group.
   *  - On  → "manage" (implies View)
   *  - Off → "view"  (retains View, just drops all write flags)
   */
  function handleManageToggle(groupId: string) {
    const current = groupStates[groupId] ?? "none";
    const next: GroupState = current === "manage" ? "view" : "manage";
    applyGroupChange(groupId, next);
  }

  /** Apply a state transition to one group and record which modules changed. */
  function applyGroupChange(groupId: string, next: "view" | "manage" | "none") {
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;

    // Apply preset to every module in the group
    const moduleDiff = applyGroupState(group, next);

    setGroupStates((prev) => ({ ...prev, [groupId]: next }));
    setChangedModules((prev) => ({ ...prev, ...moduleDiff }));

    // Update the in-memory role permissions so the UI reflects the change
    setRoles((prev) => prev.map((r) => {
      if (r.id !== selectedRoleId) return r;
      return { ...r, permissions: { ...r.permissions, ...moduleDiff } };
    }));

    // If any group is toggled manually, fullAdmin can't be fully true anymore
    // unless all groups are manage — recheck
    setFullAdmin(false);
  }

  // ── Full Admin Access switch ────────────────────────────────────────────────

  function handleFullAdminToggle() {
    const next = !fullAdmin;
    setFullAdmin(next);

    if (next) {
      // Set every module in every group to Manage
      const allDiff: Record<string, ModulePermission> = {};
      for (const group of PERMISSION_GROUPS) {
        const moduleDiff = applyGroupState(group, "manage");
        Object.assign(allDiff, moduleDiff);
      }
      setGroupStates(
        Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.id, "manage" as GroupState]))
      );
      setChangedModules((prev) => ({ ...prev, ...allDiff }));
      setRoles((prev) => prev.map((r) => {
        if (r.id !== selectedRoleId) return r;
        return { ...r, permissions: { ...r.permissions, ...allDiff } };
      }));
    } else {
      // Turning off full-admin resets all groups to "none" as a starting
      // point; the Principal can then set individual groups.
      const allDiff: Record<string, ModulePermission> = {};
      for (const group of PERMISSION_GROUPS) {
        const moduleDiff = applyGroupState(group, "none");
        Object.assign(allDiff, moduleDiff);
      }
      setGroupStates(
        Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.id, "none" as GroupState]))
      );
      setChangedModules((prev) => ({ ...prev, ...allDiff }));
      setRoles((prev) => prev.map((r) => {
        if (r.id !== selectedRoleId) return r;
        return { ...r, permissions: { ...r.permissions, ...allDiff } };
      }));
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedRole) return;
    if (Object.keys(changedModules).length === 0) {
      showToast("No changes to save.", "ok");
      return;
    }
    setSaving(true);
    // Pass both the existing saved permissions (for untouched/Custom modules)
    // and the changed modules (applied on top) so the server receives the
    // complete state and doesn't accidentally delete unmodified rows.
    const result = await apiPatchRole(
      selectedRole.id,
      selectedRole.permissions,
      changedModules
    );
    setSaving(false);
    if (result.ok) {
      showToast("Permissions saved.", "ok");
      setChangedModules({});
      startTransition(() => router.refresh());
    } else {
      showToast(result.error ?? "Save failed.", "err");
    }
  }

  // ── Create / delete role ────────────────────────────────────────────────────

  async function handleCreateRole() {
    if (!newRoleName.trim()) return;
    setSaving(true);
    const result = await apiCreateRole(newRoleName.trim(), newRoleDesc.trim());
    setSaving(false);
    if (result.ok) {
      showToast(`Role "${newRoleName}" created.`, "ok");
      setNewRoleName(""); setNewRoleDesc(""); setShowCreate(false);
      startTransition(() => router.refresh());
    } else {
      showToast(result.error ?? "Create failed.", "err");
    }
  }

  async function handleDeleteRole(role: RoleData) {
    if (role.userCount > 0) {
      showToast(`${role.userCount} staff member(s) still assigned. Reassign first.`, "err");
      return;
    }
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    const result = await apiDeleteRole(role.id);
    if (result.ok) {
      showToast(`Role "${role.name}" deleted.`, "ok");
      startTransition(() => router.refresh());
    } else {
      showToast(result.error ?? "Delete failed.", "err");
    }
  }

  const hasChanges = Object.keys(changedModules).length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl
          shadow-lg text-sm font-medium animate-scale-in
          ${toast.type === "ok"
            ? "bg-success-bg text-success border border-success/20"
            : "bg-danger-bg text-danger border border-danger/20"}`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Role selector + create ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => { setSelectedRoleId(r.id); setActiveTab("matrix"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                transition-colors border
                ${r.id === selectedRoleId
                  ? "bg-teal/10 text-teal border-teal/30 dark:bg-teal/15 dark:border-teal/30"
                  : "text-slate border-border hover:border-teal/30 hover:bg-teal-50 dark:hover:border-teal/30"
                }`}
            >
              <Shield className="h-3.5 w-3.5" />
              {r.name}
              <span className="text-[10px] opacity-60">({r.userCount})</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     border border-teal/30 bg-teal/5 text-teal hover:bg-teal/10
                     transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" /> New role
        </button>
      </div>

      {/* ── Create role form ────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs animate-scale-in">
          <p className="text-sm font-semibold text-foreground mb-3">Create new role</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name (e.g. ICT Coordinator)"
              className="flex-1 h-10 px-3 rounded-lg border border-border text-sm text-foreground
                         bg-background focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
            <input
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="flex-1 h-10 px-3 rounded-lg border border-border text-sm text-foreground
                         bg-background focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
            <button
              onClick={handleCreateRole}
              disabled={!newRoleName.trim() || saving}
              className="h-10 px-4 rounded-lg bg-teal text-white text-sm font-medium
                         hover:bg-teal-dark disabled:opacity-40 transition-colors shrink-0"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* ── Selected role panel ─────────────────────────────────────────────── */}
      {selectedRole && (
        <div className="bg-card border border-border rounded-xl shadow-xs">
          {/* Role header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3
                          px-5 pt-5 pb-3 border-b border-border">
            <div>
              <p className="font-semibold text-foreground">{selectedRole.name}</p>
              {selectedRole.description && (
                <p className="text-xs text-slate mt-0.5">{selectedRole.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Tab switcher */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["matrix", "users"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors
                      ${activeTab === tab ? "bg-teal text-white" : "text-slate hover:bg-teal-50"}`}
                  >
                    {tab === "matrix" ? "Permissions" : "Assigned users"}
                  </button>
                ))}
              </div>

              {activeTab === "matrix" && (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving || isPending || !hasChanges}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-teal text-white
                               text-sm font-medium hover:bg-teal-dark disabled:opacity-40
                               transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving…" : hasChanges ? "Save changes" : "Saved"}
                  </button>
                  <button
                    onClick={() => handleDeleteRole(selectedRole)}
                    title="Delete role"
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-slate
                               hover:bg-danger/10 hover:text-danger transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Permissions tab ─────────────────────────────────────────────── */}
          {activeTab === "matrix" && (
            <div className="p-5 space-y-3">
              {/* Column header legend */}
              <div className="flex items-center justify-end gap-6 px-1 mb-1">
                <div className="flex items-center gap-1.5 text-[11px] text-slate">
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>Manage</span>
                </div>
              </div>

              {/* Group cards */}
              {PERMISSION_GROUPS.map((group) => {
                const state    = groupStates[group.id] ?? "none";
                const isCustom = state === "custom";
                const isView   = state === "view" || state === "manage";
                const isManage = state === "manage";

                return (
                  <GroupCard
                    key={group.id}
                    group={group}
                    state={state}
                    isCustom={isCustom}
                    isView={isView}
                    isManage={isManage}
                    fullAdmin={fullAdmin}
                    onViewToggle={() => handleViewToggle(group.id)}
                    onManageToggle={() => handleManageToggle(group.id)}
                    onFullAdminToggle={group.hasAdminSwitch ? handleFullAdminToggle : undefined}
                  />
                );
              })}

              {/* Unsaved changes indicator */}
              {hasChanges && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                  You have unsaved changes. Hit &ldquo;Save changes&rdquo; to apply them.
                </p>
              )}

              {/* Info footer */}
              <div className="rounded-lg bg-background border border-border p-3 mt-2">
                <p className="text-[11px] text-slate leading-relaxed">
                  <strong className="text-foreground">View</strong> — read-only access to the module.{" "}
                  <strong className="text-foreground">Manage</strong> — full access including create,
                  edit, delete, approve, export, and print. Attendance, Diary, and student Records
                  access is granted automatically based on class/subject assignments and is not
                  configurable here.
                </p>
              </div>
            </div>
          )}

          {/* ── Assigned users tab ──────────────────────────────────────────── */}
          {activeTab === "users" && (
            <div className="p-5">
              <AssignUsersPanel
                role={selectedRole}
                staffUsers={staffUsers}
                onToast={showToast}
                onRefresh={() => startTransition(() => router.refresh())}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── GroupCard ─────────────────────────────────────────────────────────────────

interface GroupCardProps {
  group:             import("./permissionGroups").PermissionGroup;
  state:             GroupState;
  isCustom:          boolean;
  isView:            boolean;
  isManage:          boolean;
  fullAdmin:         boolean;
  onViewToggle:      () => void;
  onManageToggle:    () => void;
  onFullAdminToggle?: () => void;
}

function GroupCard({
  group, state, isCustom, isView, isManage, fullAdmin,
  onViewToggle, onManageToggle, onFullAdminToggle,
}: GroupCardProps) {
  return (
    <div className={`rounded-xl border transition-colors
      ${isCustom
        ? "border-amber-200 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10"
        : isManage
          ? "border-teal/30 bg-teal/5 dark:border-teal/25 dark:bg-teal/8"
          : isView
            ? "border-border bg-background"
            : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        {/* Group label + module list */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{group.label}</p>
          <p className="text-[10px] text-slate mt-0.5 truncate">
            {group.modules.join(" · ")}
          </p>
        </div>

        {/* Custom badge OR View + Manage checkboxes */}
        {isCustom ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400
                             whitespace-nowrap">
              Custom — click to review
            </span>
            {/* Clicking the badge on a custom group opens a clarification;
                for now we simply allow the user to click View or Manage to
                explicitly overwrite it. The checkboxes render unchecked. */}
            <div className="flex items-center gap-4 ml-3">
              <Checkbox
                label="View"
                checked={false}
                disabled={false}
                onChange={onViewToggle}
                accent="teal"
              />
              <Checkbox
                label="Manage"
                checked={false}
                disabled={false}
                onChange={onManageToggle}
                accent="teal"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5 shrink-0">
            {/* View checkbox — locked (disabled) when Manage is on */}
            <Checkbox
              label="View"
              checked={isView}
              disabled={isManage}
              onChange={onViewToggle}
              accent="teal"
            />
            {/* Manage checkbox */}
            <Checkbox
              label="Manage"
              checked={isManage}
              disabled={false}
              onChange={onManageToggle}
              accent="teal"
            />
          </div>
        )}
      </div>

      {/* Full Admin Access switch — only rendered inside the Leadership card */}
      {group.hasAdminSwitch && onFullAdminToggle && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border/60">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-teal shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Full Admin Access</p>
              <p className="text-[10px] text-slate leading-tight mt-0.5">
                Grants Manage access across all 8 groups for this role.
                Does not include Staff Roles &amp; Permissions management
                (Principal only).
              </p>
            </div>
          </div>
          <ToggleSwitch
            on={fullAdmin}
            onToggle={onFullAdminToggle}
          />
        </div>
      )}

      {/* "Manage implies View" hint */}
      {isManage && !group.hasAdminSwitch && (
        <div className="flex items-center gap-1.5 px-4 pb-2.5">
          <CheckCircle2 className="h-3 w-3 text-teal/60 shrink-0" />
          <p className="text-[10px] text-slate/70">
            Manage includes full View access.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({
  label, checked, disabled, onChange, accent = "teal",
}: {
  label:    string;
  checked:  boolean;
  disabled: boolean;
  onChange: () => void;
  accent?:  string;
}) {
  void accent; // accent is applied via Tailwind class below; keep for future theming
  return (
    <label className={`flex flex-col items-center gap-1 cursor-pointer select-none
      ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={disabled ? undefined : onChange}
        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors
          ${checked
            ? "bg-teal border-teal text-white"
            : "border-border bg-background hover:border-teal/50"
          }
          ${disabled ? "pointer-events-none" : ""}`}
      >
        {checked && (
          <svg viewBox="0 0 10 8" className="w-3 h-3 stroke-white fill-none stroke-2">
            <polyline points="1,4 4,7 9,1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="text-[10px] text-slate font-medium">{label}</span>
    </label>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0
        ${on ? "bg-teal" : "bg-line"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-xs
        transition-all ${on ? "left-5" : "left-1"}`} />
    </button>
  );
}

// ── Assign users panel ────────────────────────────────────────────────────────

interface SearchResult {
  id:              string;
  email:           string;
  role:            string;
  fullName:        string | null;
  staffId:         string | null;
  classTeacher:    string | null;
  alreadyAssigned: boolean;
}

function AssignUsersPanel({
  role, staffUsers, onToast, onRefresh,
}: {
  role:       RoleData;
  staffUsers: StaffUser[];
  onToast:    (msg: string, type: "ok" | "err") => void;
  onRefresh:  () => void;
}) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy,      setBusy]      = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Currently-assigned users (from initial server data)
  const assigned = staffUsers.filter(
    (u) =>
      u.staffRoleId === role.id ||
      u.userStaffRoles.some((r) => r.staffRoleId === role.id)
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(
          `/api/staff-roles/search-users?q=${encodeURIComponent(q)}&roleId=${role.id}`
        );
        const data = await res.json();
        setResults(data.users ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, role.id]);

  async function toggle(userId: string, currentlyAssigned: boolean) {
    setBusy(userId);
    const res = await fetch(`/api/staff-roles/${role.id}/assign`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId, assign: !currentlyAssigned }),
    });
    setBusy(null);
    if (res.ok) {
      onToast(currentlyAssigned ? "Role removed." : "Role assigned.", "ok");
      setResults((prev) =>
        prev?.map((u) =>
          u.id === userId ? { ...u, alreadyAssigned: !currentlyAssigned } : u
        ) ?? null
      );
      onRefresh();
    } else {
      const j = await res.json().catch(() => ({}));
      onToast(j.error ?? "Failed.", "err");
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate
                           pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or staff ID…"
          className="w-full h-10 pl-9 pr-4 rounded-lg border border-border text-sm
                     text-foreground bg-background focus:outline-none focus:ring-2
                     focus:ring-teal/30"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults(null); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded
                       text-slate hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search results */}
      {query.trim().length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          {searching ? (
            <div className="px-4 py-6 text-center text-sm text-slate animate-pulse">
              Searching…
            </div>
          ) : results && results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate">
              No staff found matching &ldquo;{query}&rdquo;
            </div>
          ) : results ? (
            <div>
              <p className="px-4 py-2 text-[10px] font-semibold text-slate uppercase
                            tracking-wider bg-background border-b border-border">
                Search results — {results.length} found
              </p>
              {results.map((u) => (
                <SearchResultRow
                  key={u.id}
                  user={u}
                  busy={busy === u.id}
                  onToggle={() => toggle(u.id, u.alreadyAssigned)}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Currently assigned */}
      <div>
        <p className="text-[10px] font-semibold text-slate uppercase tracking-wider mb-2">
          Assigned to this role ({assigned.length})
        </p>
        {assigned.length === 0 ? (
          <p className="text-sm text-slate py-2">
            No one assigned yet. Use the search above to find and add staff or teachers.
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {assigned.map((u) => {
              const displayName = u.teacher?.fullName ?? u.email;
              const subtitle    = u.teacher?.classTeacherOf
                ? `Class Teacher · ${u.teacher.classTeacherOf.name}`
                : u.role === "TEACHER"
                  ? "Teacher"
                  : `Admin Staff${u.teacher?.staffId ? ` · ${u.teacher.staffId}` : ""}`;
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5
                             border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal/10 text-teal text-xs
                                    font-semibold flex items-center justify-center shrink-0">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate font-medium">
                        {displayName}
                      </p>
                      <p className="text-[10px] text-slate truncate">{subtitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(u.id, true)}
                    disabled={busy === u.id}
                    className="h-7 px-3 rounded-lg text-xs font-medium transition-colors
                               shrink-0 bg-teal/10 text-teal hover:bg-danger/10
                               hover:text-danger disabled:opacity-40"
                  >
                    {busy === u.id ? "…" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate">
        Staff can hold multiple roles. Permissions from all assigned roles are merged (union).
        Teachers keep their built-in class access and gain the extra modules from this role on top.
      </p>
    </div>
  );
}

// ── SearchResultRow ───────────────────────────────────────────────────────────

function SearchResultRow({
  user, busy, onToggle,
}: {
  user:     SearchResult;
  busy:     boolean;
  onToggle: () => void;
}) {
  const isTeacher      = user.role === "TEACHER";
  const isClassTeacher = Boolean(user.classTeacher);
  const displayName    = user.fullName ?? user.email;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5
                    border-b border-border/50 last:border-0
                    hover:bg-teal-50/30 dark:hover:bg-teal/5 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center
          justify-center shrink-0
          ${user.alreadyAssigned
            ? "bg-teal/10 text-teal"
            : isClassTeacher
              ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
              : isTeacher
                ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                : "bg-slate/10 text-slate"
          }`}>
          {isTeacher
            ? <GraduationCap className="h-3.5 w-3.5" />
            : <UserCheck className="h-3.5 w-3.5" />
          }
        </div>

        <div className="min-w-0">
          <p className="text-sm text-foreground truncate font-medium">{displayName}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {user.email !== displayName && (
              <span className="text-[10px] text-slate truncate">{user.email}</span>
            )}
            {user.staffId && (
              <span className="text-[10px] text-slate/60">· {user.staffId}</span>
            )}
            {isClassTeacher && (
              <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5
                               rounded-full dark:bg-amber-900/20 dark:text-amber-400">
                Class Teacher · {user.classTeacher}
              </span>
            )}
            {isTeacher && !isClassTeacher && (
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5
                               rounded-full dark:bg-blue-900/20 dark:text-blue-400">
                Teacher
              </span>
            )}
            {!isTeacher && (
              <span className="text-[10px] bg-slate/10 text-slate px-1.5 py-0.5 rounded-full">
                Admin staff
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onToggle}
        disabled={busy}
        className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors shrink-0
          disabled:opacity-40
          ${user.alreadyAssigned
            ? "bg-teal/10 text-teal hover:bg-danger/10 hover:text-danger"
            : "bg-line text-slate hover:bg-teal/10 hover:text-teal"
          }`}
      >
        {busy ? "…" : user.alreadyAssigned ? "Remove" : "Assign"}
      </button>
    </div>
  );
}
