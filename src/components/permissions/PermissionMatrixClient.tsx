"use client";

/**
 * PermissionMatrixClient — full permission matrix editor for Principals.
 *
 * Features:
 *  - Create / rename / delete custom roles
 *  - Granular per-module action toggles (View/Create/Edit/Delete/Approve/Export/Print/Configure/AI)
 *  - "Manage all" shorthand that sets all write flags at once
 *  - Search any staff member (ADMIN_STAFF or TEACHER) by name / email / staff ID
 *    and assign / remove extra permissions on top of their built-in role
 *  - Changes saved via PATCH /api/staff-roles/[id] and immediately active
 *  - Optimistic UI with server revalidation
 */

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Save, X,
  Shield, Eye, PenLine, CheckSquare, Printer, Download, Cog, Sparkles, ThumbsUp,
  Search, UserCheck, GraduationCap,
} from "lucide-react";

// ── Types (must match server) ─────────────────────────────────────────────────

export type ActionKey =
  "canView" | "canCreate" | "canEdit" | "canDelete" |
  "canApprove" | "canExport" | "canPrint" | "canManage" | "canConfigure" | "canAIAccess";

export interface ModulePermission {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  canApprove: boolean; canExport: boolean; canPrint: boolean;
  canManage: boolean; canConfigure: boolean; canAIAccess: boolean;
}

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
  role: string;                       // "ADMIN_STAFF" | "TEACHER"
  staffRoleId: string | null;
  userStaffRoles: { staffRoleId: string }[];
  teacher?: {
    fullName:      string | null;
    staffId:       string | null;
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

// ── Action metadata ───────────────────────────────────────────────────────────

const ACTIONS: { key: ActionKey; label: string; Icon: React.ElementType; short: string }[] = [
  { key: "canView",      label: "View",      Icon: Eye,         short: "V"  },
  { key: "canCreate",    label: "Create",    Icon: Plus,        short: "C"  },
  { key: "canEdit",      label: "Edit",      Icon: PenLine,     short: "E"  },
  { key: "canDelete",    label: "Delete",    Icon: Trash2,      short: "D"  },
  { key: "canApprove",   label: "Approve",   Icon: ThumbsUp,    short: "A"  },
  { key: "canExport",    label: "Export",    Icon: Download,    short: "Ex" },
  { key: "canPrint",     label: "Print",     Icon: Printer,     short: "P"  },
  { key: "canConfigure", label: "Configure", Icon: Cog,         short: "Cf" },
  { key: "canAIAccess",  label: "AI Access", Icon: Sparkles,    short: "AI" },
];

const EMPTY_PERM: ModulePermission = {
  canView: false, canCreate: false, canEdit: false, canDelete: false,
  canApprove: false, canExport: false, canPrint: false,
  canManage: false, canConfigure: false, canAIAccess: false,
};

function fullPerm(): ModulePermission {
  return { canView:true, canCreate:true, canEdit:true, canDelete:true,
           canApprove:true, canExport:true, canPrint:true,
           canManage:true, canConfigure:false, canAIAccess:false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isManageAll(p: ModulePermission): boolean {
  return p.canView && p.canCreate && p.canEdit && p.canDelete && p.canExport && p.canPrint;
}

async function apiPatchRole(
  roleId: string,
  payload: { name?: string; description?: string; permissions?: Record<string, ModulePermission> }
): Promise<{ ok: boolean; error?: string }> {
  // Convert to API shape: flatten permissions to array
  const permissions = payload.permissions
    ? Object.entries(payload.permissions).map(([module, p]) => ({ module, ...p }))
    : undefined;
  const res = await fetch(`/api/staff-roles/${roleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, permissions }),
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, permissions: [] }),
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

// ── Main component ────────────────────────────────────────────────────────────

export default function PermissionMatrixClient({ roles: initialRoles, modules, staffUsers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [roles, setRoles]             = useState<RoleData[]>(initialRoles);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(initialRoles[0]?.id ?? null);
  const [toast, setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [expandedHubs, setExpandedHubs] = useState<Set<string>>(new Set(["academic","people","administration"]));
  const [activeTab, setActiveTab]     = useState<"matrix" | "users">("matrix");

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  // group modules by hub
  const hubGroups = modules.reduce<Record<string, ModuleData[]>>((acc, m) => {
    (acc[m.hub] ??= []).push(m); return acc;
  }, {});

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  function toggleHub(hub: string) {
    setExpandedHubs((prev) => {
      const next = new Set(prev);
      if (next.has(hub)) { next.delete(hub); } else { next.add(hub); }
      return next;
    });
  }

  function updatePerm(moduleKey: string, action: ActionKey, value: boolean) {
    if (!selectedRole) return;
    setRoles((prev) => prev.map((r) => {
      if (r.id !== selectedRole.id) return r;
      const existing = r.permissions[moduleKey] ?? { ...EMPTY_PERM };
      let updated: ModulePermission = { ...existing, [action]: value };
      // canView is implied by any other flag
      if (action !== "canView" && value) updated.canView = true;
      // canManage auto-sets all write flags
      if (action === "canManage" && value) updated = fullPerm();
      if (action === "canManage" && !value) updated.canManage = false;
      return { ...r, permissions: { ...r.permissions, [moduleKey]: updated } };
    }));
  }

  function setModuleManageAll(moduleKey: string, all: boolean) {
    if (!selectedRole) return;
    setRoles((prev) => prev.map((r) => {
      if (r.id !== selectedRole.id) return r;
      return { ...r, permissions: { ...r.permissions, [moduleKey]: all ? fullPerm() : { ...EMPTY_PERM } } };
    }));
  }

  async function handleSave() {
    if (!selectedRole) return;
    setSaving(true);
    const result = await apiPatchRole(selectedRole.id, { permissions: selectedRole.permissions });
    setSaving(false);
    if (result.ok) {
      showToast("Permissions saved.", "ok");
      startTransition(() => router.refresh());
    } else {
      showToast(result.error ?? "Save failed.", "err");
    }
  }

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
    if (role.userCount > 0) { showToast(`${role.userCount} staff member(s) still assigned. Reassign first.`, "err"); return; }
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    const result = await apiDeleteRole(role.id);
    if (result.ok) {
      showToast(`Role "${role.name}" deleted.`, "ok");
      startTransition(() => router.refresh());
    } else {
      showToast(result.error ?? "Delete failed.", "err");
    }
  }

  const currentPerms = selectedRole?.permissions ?? {};

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-scale-in
          ${toast.type === "ok" ? "bg-success-bg text-success border border-success/20" : "bg-danger-bg text-danger border border-danger/20"}`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Role selector + create */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {roles.map((r) => (
            <button key={r.id} onClick={() => setSelectedRoleId(r.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border
                ${r.id === selectedRoleId
                  ? "bg-teal/10 text-teal border-teal/30 dark:bg-teal/15 dark:border-teal/30"
                  : "text-slate border-border hover:border-teal/30 hover:bg-teal-50 dark:hover:border-teal/30"
                }`}>
              <Shield className="h-3.5 w-3.5" />
              {r.name}
              <span className="text-[10px] opacity-60">({r.userCount})</span>
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-teal/30
                     bg-teal/5 text-teal hover:bg-teal/10 transition-colors shrink-0">
          <Plus className="h-4 w-4" /> New role
        </button>
      </div>

      {/* Create new role form */}
      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs animate-scale-in">
          <p className="text-sm font-semibold text-foreground mb-3">Create new role</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name (e.g. ICT Coordinator)"
              className="flex-1 h-10 px-3 rounded-lg border border-border text-sm text-foreground bg-background
                         focus:outline-none focus:ring-2 focus:ring-teal/30" />
            <input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="flex-1 h-10 px-3 rounded-lg border border-border text-sm text-foreground bg-background
                         focus:outline-none focus:ring-2 focus:ring-teal/30" />
            <button onClick={handleCreateRole} disabled={!newRoleName.trim() || saving}
              className="h-10 px-4 rounded-lg bg-teal text-white text-sm font-medium
                         hover:bg-teal-dark disabled:opacity-40 transition-colors shrink-0">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {selectedRole && (
        <div className="bg-card border border-border rounded-xl shadow-xs">
          {/* Role header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-border">
            <div>
              <p className="font-semibold text-foreground">{selectedRole.name}</p>
              {selectedRole.description && <p className="text-xs text-slate mt-0.5">{selectedRole.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {/* Tab switcher */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["matrix", "users"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors
                      ${activeTab === tab ? "bg-teal text-white" : "text-slate hover:bg-teal-50"}`}>
                    {tab === "matrix" ? "Permissions" : "Assigned users"}
                  </button>
                ))}
              </div>
              <button onClick={handleSave} disabled={saving || isPending}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-teal text-white text-sm font-medium
                           hover:bg-teal-dark disabled:opacity-40 transition-colors">
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => handleDeleteRole(selectedRole)} title="Delete role"
                className="h-9 w-9 flex items-center justify-center rounded-lg text-slate hover:bg-danger/10 hover:text-danger transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Permission matrix */}
          {activeTab === "matrix" && (
            <div className="overflow-x-auto">
              {/* Column headers */}
              <div className="min-w-[680px]">
                <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-background">
                  <div className="flex-1 text-[10px] font-semibold text-slate uppercase tracking-wider">Module</div>
                  <div className="w-16 text-center text-[10px] font-semibold text-slate uppercase tracking-wider">All</div>
                  {ACTIONS.map((a) => (
                    <div key={a.key} className="w-8 flex flex-col items-center gap-0.5" title={a.label}>
                      <a.Icon className="h-3 w-3 text-slate" />
                      <span className="text-[9px] text-slate">{a.short}</span>
                    </div>
                  ))}
                </div>

                {/* Module rows grouped by hub */}
                {Object.entries(hubGroups).map(([hub, mods]) => (
                  <div key={hub}>
                    <button onClick={() => toggleHub(hub)}
                      className="w-full flex items-center gap-2 px-5 py-2 bg-background/60/40
                                 border-b border-border text-left hover:bg-teal-50 dark:hover:bg-teal/5 transition-colors">
                      {expandedHubs.has(hub)
                        ? <ChevronDown className="h-3.5 w-3.5 text-slate" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate" />}
                      <span className="text-[11px] font-semibold text-slate uppercase tracking-wider capitalize">
                        {hub.replace("-", " ")}
                      </span>
                      <span className="text-[10px] text-slate/50/50">{mods.length} modules</span>
                    </button>

                    {expandedHubs.has(hub) && mods.map((mod) => {
                      const perm = currentPerms[mod.key] ?? { ...EMPTY_PERM };
                      const manageAll = isManageAll(perm);
                      return (
                        <div key={mod.key}
                          className="flex items-center gap-1 px-5 py-2.5 border-b border-border/60/60
                                     hover:bg-teal-50/30 dark:hover:bg-teal/5 transition-colors min-w-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{mod.label}</p>
                            <p className="text-[10px] text-slate/70 truncate">{mod.description}</p>
                          </div>
                          {/* Manage-all toggle */}
                          <div className="w-16 flex justify-center">
                            <button onClick={() => setModuleManageAll(mod.key, !manageAll)}
                              className={`w-8 h-5 rounded-full transition-colors relative
                                ${manageAll ? "bg-teal" : "bg-line"}`}
                              title={manageAll ? "Remove all access" : "Grant full access"}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow-xs transition-all
                                ${manageAll ? "left-3.5" : "left-0.5"}`} />
                            </button>
                          </div>
                          {/* Per-action checkboxes */}
                          {ACTIONS.map((a) => (
                            <div key={a.key} className="w-8 flex justify-center">
                              <button
                                onClick={() => updatePerm(mod.key, a.key, !perm[a.key])}
                                title={`${a.label} — ${mod.label}`}
                                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors
                                  ${perm[a.key]
                                    ? "bg-teal border-teal text-white"
                                    : "border-border hover:border-teal/40"}`}>
                                {perm[a.key] && <CheckSquare className="h-3 w-3" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assigned users tab */}
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

// ── Assign users panel ────────────────────────────────────────────────────────

/** Shape returned by /api/staff-roles/search-users */
interface SearchResult {
  id:              string;
  email:           string;
  role:            string;
  fullName:        string | null;
  staffId:         string | null;
  classTeacher:    string | null;   // class name if this teacher is a class teacher
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
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<SearchResult[] | null>(null);
  const [searching,   setSearching]   = useState(false);
  const [busy,        setBusy]        = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Currently-assigned users (from initial server data) ───────────────────
  const assigned = staffUsers.filter(
    (u) =>
      u.staffRoleId === role.id ||
      u.userStaffRoles.some((r) => r.staffRoleId === role.id)
  );

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
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

  // ── Assign / remove ────────────────────────────────────────────────────────
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
      // Optimistically flip the flag in search results
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
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or staff ID…"
          className="w-full h-10 pl-9 pr-4 rounded-lg border border-border text-sm text-foreground bg-background
                     focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults(null); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Search results ─────────────────────────────────────────────── */}
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
              <p className="px-4 py-2 text-[10px] font-semibold text-slate uppercase tracking-wider
                            bg-background border-b border-border">
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

      {/* ── Currently assigned ─────────────────────────────────────────── */}
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
                             border-b border-border/50/50 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal/10 text-teal text-xs font-semibold
                                    flex items-center justify-center shrink-0">
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
                    className="h-7 px-3 rounded-lg text-xs font-medium transition-colors shrink-0
                               bg-teal/10 text-teal hover:bg-danger/10 hover:text-danger
                               disabled:opacity-40"
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

// ── Search result row ─────────────────────────────────────────────────────────

function SearchResultRow({
  user, busy, onToggle,
}: {
  user:     SearchResult;
  busy:     boolean;
  onToggle: () => void;
}) {
  const isTeacher     = user.role === "TEACHER";
  const isClassTeacher = Boolean(user.classTeacher);
  const displayName   = user.fullName ?? user.email;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5
                    border-b border-border/50/50 last:border-0
                    hover:bg-teal-50/30 dark:hover:bg-teal/5 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Role icon badge */}
        <div className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center shrink-0
          ${user.alreadyAssigned
            ? "bg-teal/10 text-teal"
            : isClassTeacher
              ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
              : isTeacher
                ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                : "bg-slate/10 text-slate"
          }`}>
          {isClassTeacher
            ? <GraduationCap className="h-3.5 w-3.5" />
            : isTeacher
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
              <span className="text-[10px] text-slate/60/60">· {user.staffId}</span>
            )}
            {isClassTeacher && (
              <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full
                               dark:bg-amber-900/20 dark:text-amber-400">
                Class Teacher · {user.classTeacher}
              </span>
            )}
            {isTeacher && !isClassTeacher && (
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full
                               dark:bg-blue-900/20 dark:text-blue-400">
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
        className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors shrink-0 disabled:opacity-40
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
