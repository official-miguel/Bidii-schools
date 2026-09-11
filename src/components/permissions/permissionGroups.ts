/**
 * permissionGroups.ts
 *
 * Defines the 8 display groups shown on the Principal's "Staff Roles &
 * Permissions" screen.  This is PURELY a UI-layer config — it does not
 * touch Module enum values, MODULE_INFO, ModuleAccess flags, or the
 * RolePermission DB table.
 *
 * The flag presets (VIEW_PRESET / MANAGE_PRESET) must stay shape-compatible
 * with the existing PATCH /api/staff-roles/[id] payload contract.
 */

// ── Shared type — re-exported so PermissionMatrixClient doesn't need to
//    re-declare it and there are no circular imports. ─────────────────────────

export interface ModulePermission {
  canView:      boolean;
  canCreate:    boolean;
  canEdit:      boolean;
  canDelete:    boolean;
  canApprove:   boolean;
  canExport:    boolean;
  canPrint:     boolean;
  canManage:    boolean;
  canConfigure: boolean;
  canAIAccess:  boolean;
}

// ── Preset flag sets ──────────────────────────────────────────────────────────

/** "View" preset — read-only access. */
export const VIEW_PRESET: ModulePermission = {
  canView:      true,
  canCreate:    false,
  canEdit:      false,
  canDelete:    false,
  canApprove:   false,
  canExport:    false,
  canPrint:     false,
  canManage:    false,
  canConfigure: false,
  canAIAccess:  false,
};

/** "Manage" preset — full access (all flags true). */
export const MANAGE_PRESET: ModulePermission = {
  canView:      true,
  canCreate:    true,
  canEdit:      true,
  canDelete:    true,
  canApprove:   true,
  canExport:    true,
  canPrint:     true,
  canManage:    true,
  canConfigure: true,
  canAIAccess:  true,
};

/** No access — all flags false. */
export const NO_ACCESS_PRESET: ModulePermission = {
  canView:      false,
  canCreate:    false,
  canEdit:      false,
  canDelete:    false,
  canApprove:   false,
  canExport:    false,
  canPrint:     false,
  canManage:    false,
  canConfigure: false,
  canAIAccess:  false,
};

// ── Group type ────────────────────────────────────────────────────────────────

export type GroupState = "view" | "manage" | "none" | "custom";

export interface PermissionGroup {
  /** Unique identifier used as React key and state key. */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /**
   * Module enum string values that belong to this group.
   * These must match the Module enum values exactly — they are passed
   * unchanged to the PATCH payload.
   */
  modules: string[];
  /** Whether this group contains the "Full Admin Access" switch (Leadership only). */
  hasAdminSwitch?: boolean;
}

// ── The 8 groups ──────────────────────────────────────────────────────────────
//
// EXCLUDED from this screen (handled automatically by the resolver, never
// shown as a manual toggle):
//   - TOD              — removed entirely
//   - ATTENDANCE       — auto-granted via Source 3 (class teacher)
//   - DIARY            — auto-granted via Source 2 (subject teacher)
//   - RECORDS          — auto-granted via Source 1 baseline
//   - RECORDS_DISCIPLINE   — auto-granted via Source 1 baseline
//   - RECORDS_ACHIEVEMENTS — auto-granted via Source 1 baseline
//   - STAFF_ROLES      — hardcoded Principal-only; must never be assignable
//
// These rows still exist in the DB and are read by getEffectivePermissions()
// exactly as before.  They are simply not shown or written by this screen.

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id:      "fees",
    label:   "Fees",
    modules: ["FEES"],
  },
  {
    id:      "library",
    label:   "Library",
    modules: ["LIBRARY"],
  },
  {
    id:      "timetable",
    label:   "Timetable",
    modules: ["TIMETABLE"],
  },
  {
    id:      "examination",
    label:   "Examination",
    modules: ["ASSESSMENT_FRAMEWORK", "EXAM_PERIODS", "RESULTS", "ASSESSMENTS"],
  },
  {
    id:      "students-academic",
    label:   "Students & Academic",
    modules: ["SUBJECTS", "CLASSES", "STUDENTS"],
  },
  {
    id:      "student-life",
    label:   "Student Life",
    modules: ["ACCOMMODATION"],
  },
  {
    id:      "communication",
    label:   "Communication",
    modules: ["COMMUNICATION", "CALENDAR"],
  },
  {
    id:      "leadership",
    label:   "Leadership",
    modules: ["AI_TOOLS", "ANALYTICS", "REPORTS", "STAFF", "DEPARTMENTS", "HISTORY"],
    hasAdminSwitch: true,
  },
];

/**
 * All modules that appear in any group — used to derive which modules belong
 * to the "excluded from screen" category without hardcoding a second list.
 */
export const SCREEN_MODULES = new Set(
  PERMISSION_GROUPS.flatMap((g) => g.modules)
);

// ── Preset comparison helpers ─────────────────────────────────────────────────

function permsEqual(a: ModulePermission, b: ModulePermission): boolean {
  return (
    a.canView      === b.canView      &&
    a.canCreate    === b.canCreate    &&
    a.canEdit      === b.canEdit      &&
    a.canDelete    === b.canDelete    &&
    a.canApprove   === b.canApprove   &&
    a.canExport    === b.canExport    &&
    a.canPrint     === b.canPrint     &&
    a.canManage    === b.canManage    &&
    a.canConfigure === b.canConfigure &&
    a.canAIAccess  === b.canAIAccess
  );
}

/**
 * Derive the display state for a group given the current saved permissions.
 *
 * Rules (per spec §3):
 *  - All modules match VIEW_PRESET   → "view"
 *  - All modules match MANAGE_PRESET → "manage"
 *  - All modules match NO_ACCESS     → "none"
 *  - Any mismatch (mixed flags, partial combos, modules differing from each
 *    other) → "custom"  (never auto-rounded; shown as "Custom — click to review")
 */
export function deriveGroupState(
  group: PermissionGroup,
  permissions: Record<string, ModulePermission>
): GroupState {
  const states = group.modules.map((mod) => {
    const p = permissions[mod] ?? NO_ACCESS_PRESET;
    if (permsEqual(p, VIEW_PRESET))   return "view"   as const;
    if (permsEqual(p, MANAGE_PRESET)) return "manage" as const;
    if (permsEqual(p, NO_ACCESS_PRESET)) return "none" as const;
    return "custom" as const;
  });

  // All modules must agree on the same state; otherwise "custom"
  const first = states[0];
  if (states.every((s) => s === first)) return first;
  return "custom";
}

/**
 * Apply a GroupState to every module in the group and return a partial
 * permissions map of only the changed entries.  "custom" is not a valid
 * input state (the UI prevents selecting it).
 */
export function applyGroupState(
  group: PermissionGroup,
  state: "view" | "manage" | "none"
): Record<string, ModulePermission> {
  const preset =
    state === "manage" ? MANAGE_PRESET :
    state === "view"   ? VIEW_PRESET   :
                         NO_ACCESS_PRESET;

  return Object.fromEntries(group.modules.map((mod) => [mod, { ...preset }]));
}
