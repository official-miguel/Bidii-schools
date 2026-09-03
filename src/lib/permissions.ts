import type { Module, User } from "@prisma/client";
import { prisma } from "./prisma";
import { getCurrentUser } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Module registry — single source of truth for labels, descriptions, and which
// navigation hub each module belongs to. Adding a new module here is the only
// change needed for it to appear in the permission matrix, nav filters, and
// role seeding automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_INFO: Record<
  Module,
  { label: string; description: string; hub: NavHub }
> = {
  DEPARTMENTS:          { label: "Departments",               description: "Manage subject departments and heads",                                hub: "people" },
  SUBJECTS:             { label: "Subjects",                  description: "Manage the school's subject list",                                   hub: "academic" },
  STAFF:                { label: "Staff",                     description: "Manage teaching and non-teaching staff",                             hub: "people" },
  STAFF_ROLES:          { label: "Staff Roles & Permissions", description: "Define roles and what each can access (Principal only)",             hub: "administration" },
  CLASSES:              { label: "Classes",                   description: "Manage classes/streams",                                             hub: "academic" },
  STUDENTS:             { label: "Students",                  description: "Manage student records",                                             hub: "people" },
  TIMETABLE:            { label: "Timetable",                 description: "Build and edit the weekly timetable",                               hub: "academic" },
  EXAM_PERIODS:         { label: "Exam Periods (legacy)",     description: "Legacy module — superseded by ASSESSMENTS",                         hub: "academic" },
  RESULTS:              { label: "Results (legacy)",          description: "Legacy module — superseded by ASSESSMENTS",                         hub: "academic" },
  ASSESSMENTS:          { label: "Assessments",               description: "Enter and view assessment results across all frameworks",            hub: "academic" },
  ASSESSMENT_FRAMEWORK: { label: "Assessment Framework",      description: "Configure learning areas, strands, papers, and competency units",   hub: "academic" },
  TOD:                  { label: "Teacher on Duty",           description: "Manage duty rosters",                                               hub: "people" },
  COMMUNICATION:        { label: "Communication Centre",      description: "Send messages to staff, parents, and students",                     hub: "communication" },
  CALENDAR:             { label: "School Calendar",           description: "Manage the school calendar",                                        hub: "calendar" },
  AI_TOOLS:             { label: "AI Tools",                  description: "AI-assisted timetable, TOD, and insights",                         hub: "administration" },
  REPORTS:              { label: "Reports",                   description: "End-of-term and analytics reports",                                 hub: "administration" },
  RECORDS:              { label: "Records",                   description: "Discipline records, cases, and student achievements",               hub: "student-life" },
  RECORDS_DISCIPLINE:   { label: "Records — Discipline",      description: "Discipline cases, files, AI summaries, print/export",              hub: "student-life" },
  RECORDS_ACHIEVEMENTS: { label: "Records — Achievements",   description: "Achievements, shared achievements, files, AI summaries",            hub: "student-life" },
  ANALYTICS:            { label: "Analytics",                 description: "School performance analytics and insights",                         hub: "administration" },
  LIBRARY:              { label: "Library",                   description: "Book catalogue, student library cards, borrowing, and fines",       hub: "academic" },
  HISTORY:              { label: "History",                   description: "Archived institutional records",                                    hub: "people" },
  ACCOMMODATION:        { label: "Accommodation",             description: "Dormitories, cubicles, beds, and student boarding allocations",     hub: "student-life" },
  ATTENDANCE:           { label: "Attendance",                description: "Take and review daily class attendance for any class",               hub: "academic" },
  FEES:                 { label: "Fees Management",           description: "School finance: fee structures, invoicing, payments, debtor tracking, and reports", hub: "administration" },
  DIARY:                { label: "Diary",                     description: "Post and view assignments, homework, and subject announcements",                       hub: "diary" },
};

export const ALL_MODULES = Object.keys(MODULE_INFO) as Module[];

// ─────────────────────────────────────────────────────────────────────────────
// Navigation hub types — used by the role-aware sidebar to filter hubs
// ─────────────────────────────────────────────────────────────────────────────

export type NavHub =
  | "dashboard"
  | "academic"
  | "people"
  | "student-life"
  | "calendar"
  | "communication"
  | "administration"
  | "diary"
  | "parent";

// ─────────────────────────────────────────────────────────────────────────────
// Granular permission record — mirrors the RolePermission DB columns exactly.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleAccess {
  canView:      boolean;
  canCreate:    boolean;
  canEdit:      boolean;
  canDelete:    boolean;
  canApprove:   boolean;
  canExport:    boolean;
  canPrint:     boolean;
  canManage:    boolean; // legacy "full write" shorthand
  canConfigure: boolean;
  canAIAccess:  boolean;
}

export type EffectivePermissions = Partial<Record<Module, ModuleAccess>>;

/** Full access object — used for PRINCIPAL and for merging */
const FULL_ACCESS: ModuleAccess = {
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

const NO_ACCESS: ModuleAccess = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Permission combination engine
// Merges permissions from multiple roles by taking the union (OR) of every
// flag. A single role granting canExport is enough — we never downgrade.
// ─────────────────────────────────────────────────────────────────────────────

function mergeAccess(a: ModuleAccess, b: ModuleAccess): ModuleAccess {
  return {
    canView:      a.canView      || b.canView,
    canCreate:    a.canCreate    || b.canCreate,
    canEdit:      a.canEdit      || b.canEdit,
    canDelete:    a.canDelete    || b.canDelete,
    canApprove:   a.canApprove   || b.canApprove,
    canExport:    a.canExport    || b.canExport,
    canPrint:     a.canPrint     || b.canPrint,
    canManage:    a.canManage    || b.canManage,
    canConfigure: a.canConfigure || b.canConfigure,
    canAIAccess:  a.canAIAccess  || b.canAIAccess,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getEffectivePermissions
// The central function every layout, API route, and component calls.
//
// Resolution order:
//  1. PRINCIPAL → unconditional full access to all modules.
//  2. BURSAR → full FEES access + read/export/print STUDENTS + send COMMUNICATION.
//  3. ADMIN_STAFF → union of all assigned StaffRole permissions (multi-role).
//     Falls back to legacy User.staffRoleId if UserStaffRole table is empty.
//  4. TEACHER → same multi-role union as ADMIN_STAFF when the teacher has
//     StaffRole assignments. Returns empty when no roles assigned (teacher
//     layout then falls back to "show all hubs" default).
//  5. STUDENT / PARENT / others → empty.
// ─────────────────────────────────────────────────────────────────────────────

export async function getEffectivePermissions(user: User): Promise<EffectivePermissions> {
  if (user.role === "PRINCIPAL") {
    const full: EffectivePermissions = {};
    for (const m of ALL_MODULES) full[m] = { ...FULL_ACCESS };
    return full;
  }

  // BURSAR: full access to FEES module + read/export/print STUDENTS + send COMMUNICATION
  if (user.role === "BURSAR") {
    return {
      FEES:          { ...FULL_ACCESS },
      STUDENTS:      { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: true, canPrint: true, canManage: false, canConfigure: false, canAIAccess: false },
      COMMUNICATION: { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false, canPrint: false, canManage: false, canConfigure: false, canAIAccess: false },
    };
  }

  // TEACHER: use the five-source resolver
  if (user.role === "TEACHER") {
    return getTeacherEffectivePermissions(user);
  }

  // ADMIN_STAFF: union of all assigned StaffRole permissions (multi-role).
  if (user.role === "ADMIN_STAFF") {
    // Collect all StaffRole IDs assigned to this user via the join table.
    const multiRoleRows = await prisma.userStaffRole.findMany({
      where: { userId: user.id },
      select: { staffRoleId: true },
    });

    let roleIds: string[] = multiRoleRows.map((r) => r.staffRoleId);

    // Fall back to the legacy single-role FK if no multi-role rows exist yet
    // (handles accounts that pre-date the migration).
    if (roleIds.length === 0 && user.staffRoleId) {
      roleIds = [user.staffRoleId];
    }

    if (roleIds.length === 0) return {};

    // Load all RolePermission rows for every assigned role in one query.
    const rows = await prisma.rolePermission.findMany({
      where: { staffRoleId: { in: roleIds } },
    });

    // Merge: start with an empty map, then OR-merge every row into it.
    const perms: EffectivePermissions = {};
    for (const row of rows) {
      const current = perms[row.module] ?? { ...NO_ACCESS };
      perms[row.module] = mergeAccess(current, {
        canView:      row.canView,
        canCreate:    row.canCreate    ?? row.canManage,
        canEdit:      row.canEdit      ?? row.canManage,
        canDelete:    row.canDelete    ?? row.canManage,
        canApprove:   row.canApprove   ?? false,
        canExport:    row.canExport    ?? row.canManage,
        canPrint:     row.canPrint     ?? row.canManage,
        canManage:    row.canManage,
        canConfigure: row.canConfigure ?? false,
        canAIAccess:  row.canAIAccess  ?? false,
      });
    }
    return perms;
  }

  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Five-Source Teacher Permission Resolver (R2)
// Computes a teacher's full EffectivePermissions as the union of:
//   Source 1 — Baseline Grant (every teacher)
//   Source 2 — Subject Teacher Scope (ClassSubjectTeacher / elective rows)
//   Source 3 — Class Teacher Scope (SchoolClass.classTeacherId)
//   Source 4 — HOD Scope (Department.headTeacherId)
//   Source 5 — Dorm Master Scope (Dormitory.boardingMasterId)
//   Source 6 — Assigned Roles (UserStaffRole / User.staffRoleId)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTeacherEffectivePermissions(user: User): Promise<EffectivePermissions> {
  // Fetch teacher + all assignment data in ONE query
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      subjectAssignments: { select: { classId: true, subjectId: true } },
      electiveGroupTeachers: { select: { groupId: true, subjectId: true } },
      classElectiveGroupTeachers: { select: { groupId: true, classId: true, subjectId: true } },
      classTeacherOf: { select: { id: true } },
      departmentHeadOf: { select: { id: true } },
      dormsBoardingMaster: { where: { schoolId: user.schoolId! }, select: { id: true } },
    },
  });

  const perms: EffectivePermissions = {};

  const merge = (module: Module, access: Partial<ModuleAccess>) => {
    const current = perms[module] ?? { ...NO_ACCESS };
    perms[module] = mergeAccess(current, { ...NO_ACCESS, ...access });
  };

  // Source 1: Baseline Grant (every teacher)
  merge("RECORDS_DISCIPLINE",   { canView: true, canCreate: true });
  merge("RECORDS_ACHIEVEMENTS", { canView: true, canCreate: true });
  merge("ATTENDANCE",           { canView: true });
  merge("ACCOMMODATION",        { canView: true });

  if (teacher) {
    const hasSubjectAssignments =
      teacher.subjectAssignments.length > 0 ||
      teacher.electiveGroupTeachers.length > 0 ||
      teacher.classElectiveGroupTeachers.length > 0;

    // Source 2: Subject Teacher Scope
    if (hasSubjectAssignments) {
      merge("ASSESSMENTS", { canView: true, canCreate: true, canEdit: true });
      merge("STUDENTS",    { canView: true });
      merge("DIARY",       { canView: true, canCreate: true, canEdit: true, canDelete: true });
    }

    // Source 3: Class Teacher Scope
    if (teacher.classTeacherOf) {
      merge("STUDENTS",    { canView: true, canEdit: true });
      merge("ATTENDANCE",  { canView: true, canCreate: true });
    }

    // Source 4: HOD Scope
    if (teacher.departmentHeadOf) {
      merge("ASSESSMENT_FRAMEWORK", { canConfigure: true });
      merge("ANALYTICS",            { canView: true });
    }

    // Source 5: Dorm Master Scope
    if (teacher.dormsBoardingMaster.length > 0) {
      merge("ACCOMMODATION", { canView: true, canEdit: true });
    }
  }

  // Source 6: Assigned Roles (existing StaffRole system — union on top)
  const assignedPerms = await (async () => {
    const multiRoleRows = await prisma.userStaffRole.findMany({
      where: { userId: user.id },
      select: { staffRoleId: true },
    });
    const roleIds: string[] = multiRoleRows.map((r) => r.staffRoleId);
    if (roleIds.length === 0 && user.staffRoleId) roleIds.push(user.staffRoleId);
    if (roleIds.length === 0) return {} as EffectivePermissions;

    const rows = await prisma.rolePermission.findMany({
      where: { staffRoleId: { in: roleIds } },
    });
    const result: EffectivePermissions = {};
    for (const row of rows) {
      const current = result[row.module] ?? { ...NO_ACCESS };
      result[row.module] = mergeAccess(current, {
        canView:      row.canView,
        canCreate:    row.canCreate    ?? row.canManage,
        canEdit:      row.canEdit      ?? row.canManage,
        canDelete:    row.canDelete    ?? row.canManage,
        canApprove:   row.canApprove   ?? false,
        canExport:    row.canExport    ?? row.canManage,
        canPrint:     row.canPrint     ?? row.canManage,
        canManage:    row.canManage,
        canConfigure: row.canConfigure ?? false,
        canAIAccess:  row.canAIAccess  ?? false,
      });
    }
    return result;
  })();

  // Merge assigned role permissions on top (union — never reduces)
  for (const [mod, access] of Object.entries(assignedPerms) as [Module, ModuleAccess][]) {
    const current = perms[mod as Module] ?? { ...NO_ACCESS };
    perms[mod as Module] = mergeAccess(current, access);
  }

  return perms;
}

/**
 * hasAssignedRoles — lightweight check used by the teacher layout to decide
 * whether to compute visibleHubs or use the "show everything" default.
 * Avoids a full permission load when the teacher has no extra roles.
 */
export async function hasAssignedRoles(userId: string): Promise<boolean> {
  const count = await prisma.userStaffRole.count({ where: { userId } });
  return count > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: compute which NavHubs are visible given effective permissions.
// Always shows "dashboard". Other hubs show if ≥1 module in that hub has
// canView. Used by the role-aware sidebar.
// ─────────────────────────────────────────────────────────────────────────────

export function getVisibleHubs(perms: EffectivePermissions): Set<NavHub> {
  const visible = new Set<NavHub>(["dashboard"]);
  for (const [mod, access] of Object.entries(perms) as [Module, ModuleAccess][]) {
    if (access?.canView) {
      visible.add(MODULE_INFO[mod].hub);
    }
  }
  return visible;
}

// ─────────────────────────────────────────────────────────────────────────────
// API-route guards
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "print"
  | "manage"
  | "configure"
  | "ai";

/**
 * Generic API-route guard. Returns the User if the action is permitted, or
 * null (so the route can respond 401/403). PRINCIPAL always passes.
 */
export async function requirePermission(
  module: Module,
  action: PermissionAction = "view"
): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "PRINCIPAL") return user;

  if (user.role === "ADMIN_STAFF") {
    const perms = await getEffectivePermissions(user);
    const entry = perms[module];
    if (!entry) return null;
    if (checkAction(entry, action)) return user;
  }

  if (user.role === "TEACHER") {
    const perms = await getTeacherEffectivePermissions(user);
    const entry = perms[module];
    if (!entry) return null;
    if (checkAction(entry, action)) return user;
  }

  return null;
}

/**
 * Like requirePermission but also asserts schoolId is non-null.
 * Use this in school-scoped routes to satisfy Prisma's type constraints.
 */
export async function requireSchoolPermission(
  module: Module,
  action: PermissionAction = "view"
): Promise<import("./auth").SchoolUser | null> {
  const user = await requirePermission(module, action);
  if (!user || !user.schoolId!) return null;
  return user as import("./auth").SchoolUser;
}

function checkAction(entry: ModuleAccess, action: PermissionAction): boolean {
  switch (action) {
    case "view":      return entry.canView || entry.canManage;
    case "create":    return entry.canCreate || entry.canManage;
    case "edit":      return entry.canEdit || entry.canManage;
    case "delete":    return entry.canDelete || entry.canManage;
    case "approve":   return entry.canApprove || entry.canManage;
    case "export":    return entry.canExport || entry.canManage;
    case "print":     return entry.canPrint || entry.canManage;
    case "manage":    return entry.canManage;
    case "configure": return entry.canConfigure || entry.canManage;
    case "ai":        return entry.canAIAccess;
    default:          return false;
  }
}

/** Records module guard — discipline and achievements are permissioned
 * independently; the legacy umbrella RECORDS permission still works. */
export async function requireRecordsPermission(
  section: "RECORDS_DISCIPLINE" | "RECORDS_ACHIEVEMENTS",
  action: PermissionAction = "view"
): Promise<User | null> {
  return (
    (await requirePermission(section, action)) ??
    (await requirePermission("RECORDS", action))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission audit logging
// Call after any successful permission change. Fire-and-forget — never
// throws so a logging failure never blocks the operation.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditPayload {
  schoolId:      string;
  performedById: string;
  targetUserId?: string;
  staffRoleId?:  string;
  module?:       Module;
  action:
    | "ROLE_CREATED"
    | "ROLE_UPDATED"
    | "ROLE_DELETED"
    | "PERMISSION_GRANTED"
    | "PERMISSION_REVOKED"
    | "ROLE_ASSIGNED"
    | "ROLE_UNASSIGNED";
  changes?: Record<string, unknown>;
}

export async function logPermissionAudit(payload: AuditPayload): Promise<void> {
  try {
    await prisma.permissionAuditLog.create({
      data: {
        id:            Math.random().toString(36).slice(2) + Date.now().toString(36),
        schoolId:      payload.schoolId,
        performedById: payload.performedById,
        targetUserId:  payload.targetUserId ?? null,
        staffRoleId:   payload.staffRoleId ?? null,
        module:        payload.module ?? null,
        action:        payload.action,
        changes:       payload.changes ? (payload.changes as object) : undefined,
      },
    });
  } catch {
    // Non-fatal — audit failures must not block the main operation
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default role seeds — called lazily on /api/staff-roles GET.
// Granular flags are set explicitly so the upgrade from the old canManage-only
// schema is clean and intentional.
// ─────────────────────────────────────────────────────────────────────────────

type PermissionSeed = Partial<
  Record<Module, Partial<ModuleAccess>>
>;

const DEFAULT_ROLES: {
  name: string;
  description: string;
  permissions: PermissionSeed;
}[] = [
  {
    name: "Deputy Principal",
    description: "Broad operational oversight across academics and staff",
    permissions: {
      DEPARTMENTS:          { canView: true, canCreate: true, canEdit: true, canDelete: true, canManage: true, canExport: true, canPrint: true },
      SUBJECTS:             { canView: true, canCreate: true, canEdit: true, canDelete: true, canManage: true },
      STAFF:                { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true },
      CLASSES:              { canView: true, canCreate: true, canEdit: true, canDelete: true, canManage: true },
      STUDENTS:             { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true },
      TIMETABLE:            { canView: true, canCreate: true, canEdit: true, canManage: true, canPrint: true },
      ASSESSMENTS:          { canView: true },
      ASSESSMENT_FRAMEWORK: { canView: true },
      TOD:                  { canView: true, canCreate: true, canEdit: true, canManage: true },
      REPORTS:              { canView: true, canExport: true, canPrint: true },
      HISTORY:              { canView: true },
      CALENDAR:             { canView: true, canCreate: true, canEdit: true, canManage: true },
      COMMUNICATION:        { canView: true, canCreate: true, canManage: true },
      RECORDS_DISCIPLINE:   { canView: true, canCreate: true, canEdit: true },
      RECORDS_ACHIEVEMENTS: { canView: true, canCreate: true, canEdit: true },
      ANALYTICS:            { canView: true },
    },
  },
  {
    name: "Head of Department",
    description: "Departmental oversight, marks review, and teacher performance",
    permissions: {
      SUBJECTS:             { canView: true, canEdit: true },
      STAFF:                { canView: true },
      CLASSES:              { canView: true },
      STUDENTS:             { canView: true },
      TIMETABLE:            { canView: true },
      ASSESSMENTS:          { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true },
      ASSESSMENT_FRAMEWORK: { canView: true, canEdit: true },
      REPORTS:              { canView: true, canPrint: true, canExport: true },
      CALENDAR:             { canView: true },
      RECORDS_DISCIPLINE:   { canView: true, canCreate: true, canEdit: true },
      ANALYTICS:            { canView: true },
    },
  },
  {
    name: "Class Teacher",
    description: "Class management, full-class reports, and parent messaging",
    permissions: {
      STUDENTS:             { canView: true, canEdit: true },
      CLASSES:              { canView: true },
      ASSESSMENTS:          { canView: true, canCreate: true, canEdit: true, canExport: true, canPrint: true },
      REPORTS:              { canView: true, canPrint: true, canExport: true },
      CALENDAR:             { canView: true },
      COMMUNICATION:        { canView: true, canCreate: true },
      RECORDS_DISCIPLINE:   { canView: true, canCreate: true, canEdit: true },
      RECORDS_ACHIEVEMENTS: { canView: true, canCreate: true },
    },
  },
  {
    name: "Librarian",
    description: "Library catalogue, circulation, fines, and student lookup",
    permissions: {
      STUDENTS: { canView: true },
      LIBRARY:  { canView: true, canCreate: true, canEdit: true, canDelete: true, canManage: true, canExport: true, canPrint: true, canConfigure: true },
    },
  },
  {
    name: "Boarding Master",
    description: "Dormitory management, allocation, and boarding discipline",
    permissions: {
      STUDENTS:           { canView: true },
      ACCOMMODATION:      { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true, canConfigure: true },
      RECORDS_DISCIPLINE: { canView: true, canCreate: true, canEdit: true },
      CALENDAR:           { canView: true },
    },
  },
  {
    name: "Accountant",
    description: "Fees and finance-adjacent record keeping",
    permissions: {
      STUDENTS:      { canView: true },
      COMMUNICATION: { canView: true, canCreate: true },
      REPORTS:       { canView: true, canExport: true, canPrint: true },
    },
  },
  {
    name: "Secretary",
    description: "Front-office administration",
    permissions: {
      STUDENTS:      { canView: true, canCreate: true, canEdit: true, canManage: true },
      STAFF:         { canView: true },
      COMMUNICATION: { canView: true, canCreate: true, canManage: true },
      CALENDAR:      { canView: true, canCreate: true, canEdit: true, canManage: true },
    },
  },
  {
    name: "Registrar",
    description: "Student admissions, transfers, record updates",
    permissions: {
      CLASSES:  { canView: true },
      STUDENTS: { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true },
    },
  },
  {
    name: "Examination Officer",
    description: "Manages assessment periods, results entry oversight, and report generation",
    permissions: {
      ASSESSMENTS:          { canView: true, canCreate: true, canEdit: true, canManage: true, canExport: true, canPrint: true },
      ASSESSMENT_FRAMEWORK: { canView: true, canEdit: true, canManage: true },
      REPORTS:              { canView: true, canExport: true, canPrint: true },
      STUDENTS:             { canView: true },
      CLASSES:              { canView: true },
      CALENDAR:             { canView: true },
      ANALYTICS:            { canView: true },
    },
  },
  {
    name: "Games Master",
    description: "Sports, achievements, and student activities",
    permissions: {
      STUDENTS:             { canView: true },
      RECORDS_ACHIEVEMENTS: { canView: true, canCreate: true, canEdit: true, canManage: true, canPrint: true },
      CALENDAR:             { canView: true },
      RECORDS_DISCIPLINE:   { canView: true },
    },
  },
];

/**
 * Idempotent seed — safe to call on every /api/staff-roles GET.
 * Inserts only missing roles; never overwrites school customisations.
 */
export async function ensureDefaultStaffRoles(schoolId: string): Promise<void> {
  const existing = await prisma.staffRole.findMany({
    where: { schoolId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((r) => r.name));
  const missing = DEFAULT_ROLES.filter((r) => !existingNames.has(r.name));
  if (missing.length === 0) return;

  for (const role of missing) {
    await prisma.staffRole.create({
      data: {
        schoolId,
        name: role.name,
        description: role.description,
        permissions: {
          create: Object.entries(role.permissions).map(([module, v]) => ({
            module: module as Module,
            canView:      v!.canView      ?? false,
            canCreate:    v!.canCreate    ?? false,
            canEdit:      v!.canEdit      ?? false,
            canDelete:    v!.canDelete    ?? false,
            canApprove:   v!.canApprove   ?? false,
            canExport:    v!.canExport    ?? false,
            canPrint:     v!.canPrint     ?? false,
            canManage:    v!.canManage    ?? false,
            canConfigure: v!.canConfigure ?? false,
            canAIAccess:  v!.canAIAccess  ?? false,
          })),
        },
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard role detector — used by the "/" home page dispatcher and layouts
// to determine which dashboard variant to render for an ADMIN_STAFF user.
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardVariant =
  | "principal"
  | "deputy_principal"
  | "hod"
  | "class_teacher"
  | "subject_teacher"
  | "librarian"
  | "boarding_master"
  | "staff_generic";

/** Returns the most specialised dashboard variant for a given staff user.
 *  Priority: deputy > hod > class_teacher > librarian > boarding_master > generic. */
export async function getDashboardVariant(user: User): Promise<DashboardVariant> {
  if (user.role === "PRINCIPAL") return "principal";
  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id },
      select: {
        classTeacherOf:      { select: { id: true } },
        departmentHeadOf:    { select: { id: true } },
        dormsBoardingMaster: { select: { id: true }, take: 1 },
      },
    });
    if (teacher?.departmentHeadOf)            return "hod";
    if (teacher?.classTeacherOf)              return "class_teacher";
    if (teacher?.dormsBoardingMaster?.length) return "boarding_master";
    return "subject_teacher";
  }

  if (user.role === "BURSAR") return "staff_generic"; // will use finance dashboard

  if (user.role === "ADMIN_STAFF") {
    const roleNames = await getAssignedRoleNames(user);
    const lower = roleNames.map((n) => n.toLowerCase());

    if (lower.some((n) => n.includes("deputy principal") || n.includes("deputy"))) return "deputy_principal";
    if (lower.some((n) => n.includes("head of department") || n.includes("hod")))  return "hod";
    if (lower.some((n) => n.includes("class teacher")))                             return "class_teacher";
    if (lower.some((n) => n.includes("librarian")))                                return "librarian";
    if (lower.some((n) => n.includes("boarding master") || n.includes("matron")))  return "boarding_master";

    // Also check derived assignments for ADMIN_STAFF who have a teacher record
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id },
      select: {
        classTeacherOf:      { select: { id: true } },
        departmentHeadOf:    { select: { id: true } },
        dormsBoardingMaster: { select: { id: true }, take: 1 },
      },
    }).catch(() => null);

    if (teacher?.departmentHeadOf)            return "hod";
    if (teacher?.classTeacherOf)              return "class_teacher";
    if (teacher?.dormsBoardingMaster?.length) return "boarding_master";

    const perms = await getEffectivePermissions(user);
    if (perms.ACCOMMODATION?.canView) return "boarding_master";
    if (perms.LIBRARY?.canManage)     return "librarian";
    return "staff_generic";
  }

  return "staff_generic";
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveModulePortal
//
// Single source of truth for the "should this user bypass their default
// dashboard and land directly in a module portal?" decision.
//
// Called by:
//   • src/app/page.tsx  — root dispatcher (avoids an intermediate page load)
//   • src/app/teacher/page.tsx — fallback when user navigates to /teacher directly
//   • src/app/staff/page.tsx   — fallback when user navigates to /staff directly
//
// Returns:
//   "/staff/finance"  — user has FEES canManage (and no broad oversight role)
//   "/staff/library"  — user has LIBRARY canManage (and no broad oversight role)
//   null              — render the default dashboard for this user
//
// "Broad oversight" roles (deputy, HOD, secretary, etc.) always stay on the
// unified dashboard even if they also carry module-manage permissions, because
// they need the full school-wide view.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveModulePortal(
  user: User
): Promise<"/staff/finance" | "/staff/library" | null> {
  // TEACHER path — use the six-source resolver
  if (user.role === "TEACHER") {
    const perms = await getTeacherEffectivePermissions(user);
    if (perms.FEES?.canManage)    return "/staff/finance";
    if (perms.LIBRARY?.canManage) return "/staff/library";
    return null;
  }

  // ADMIN_STAFF path — check broad-oversight guard first
  if (user.role === "ADMIN_STAFF") {
    const [perms, roleNames] = await Promise.all([
      getEffectivePermissions(user),
      getAssignedRoleNames(user),
    ]);

    const lower = roleNames.map((n) => n.toLowerCase());
    const hasBroadRole =
      lower.some((n) => n.includes("deputy") || n.includes("principal")) ||
      lower.some((n) => n.includes("head of department") || n.includes("hod")) ||
      lower.some((n) => n.includes("secretary") || n.includes("registrar")) ||
      lower.some((n) => n.includes("examination") || n.includes("games master"));

    if (hasBroadRole) return null;

    if (perms.FEES?.canManage)    return "/staff/finance";
    if (perms.LIBRARY?.canManage) return "/staff/library";
    return null;
  }

  return null;
}

/** Returns all role names assigned to a user (multi-role aware). */
export async function getAssignedRoleNames(user: User): Promise<string[]> {
  const multiRows = await prisma.userStaffRole.findMany({
    where: { userId: user.id },
    include: { staffRole: { select: { name: true } } },
  });
  if (multiRows.length > 0) return multiRows.map((r) => r.staffRole.name);

  // Legacy fallback
  if (user.staffRoleId) {
    const role = await prisma.staffRole.findUnique({
      where: { id: user.staffRoleId },
      select: { name: true },
    });
    return role ? [role.name] : [];
  }
  return [];
}

/** Returns the display label for the user's combined roles. */
export async function getRoleDisplayLabel(user: User): Promise<string> {
  if (user.role === "PRINCIPAL") return "Principal";
  if (user.role === "TEACHER")   return "Teacher";
  if (user.role === "BURSAR")    return "Bursar";
  if (user.role === "PARENT")    return "Parent";
  if (user.role === "STUDENT")   return "Student";

  const names = await getAssignedRoleNames(user);
  if (names.length === 0) return "Staff";
  if (names.length === 1) return names[0];
  // Show first two roles joined, e.g. "HOD & Class Teacher"
  return names.slice(0, 2).join(" & ") + (names.length > 2 ? " +more" : "");
}

// Re-export legacy name so existing callers don't break
export { requirePermission as requireRecordsPermissionLegacy };

// ─────────────────────────────────────────────────────────────────────────────
// getFullRoleContext
// Complete picture of all active roles — assigned + derived — for a user.
// Used by UnifiedDashboard and layouts to build the blended homepage view.
// ─────────────────────────────────────────────────────────────────────────────

export interface FullRoleContext {
  isPrincipal:       boolean;
  isDeputy:          boolean;
  isTeacher:         boolean;
  isAdminStaff:      boolean;
  /** All StaffRole names assigned to this user */
  assignedRoleNames: string[];
  /** Derived role kinds active right now: SUBJECT_TEACHER, CLASS_TEACHER, HEAD_OF_DEPT, DORM_MASTER */
  derivedKinds:      Set<string>;
  /** Combined display label, e.g. "HOD & Class Teacher" */
  displayLabel:      string;
  isLibrarian:       boolean;
  isMatron:          boolean;
  modulePermissions: EffectivePermissions;
}

export async function getFullRoleContext(user: User): Promise<FullRoleContext> {
  const isPrincipal  = user.role === "PRINCIPAL";
  const isTeacher    = user.role === "TEACHER";
  const isAdminStaff = user.role === "ADMIN_STAFF" || user.role === "BURSAR";

  const [assignedRoleNames, modulePermissions] = await Promise.all([
    isAdminStaff ? getAssignedRoleNames(user) : Promise.resolve([] as string[]),
    (isAdminStaff || isTeacher)
      ? getEffectivePermissions(user)
      : Promise.resolve({} as EffectivePermissions),
  ]);

  const lower       = assignedRoleNames.map((n) => n.toLowerCase());
  const isDeputy    = lower.some((n) => n.includes("deputy"));
  const isLibrarian = lower.some((n) => n.includes("librarian"));
  const isMatron    = lower.some((n) =>
    n.includes("matron") || (n.includes("boarding") && !n.includes("dorm"))
  );

  let derivedKinds = new Set<string>();
  if (isTeacher || isAdminStaff) {
    try {
      const { computeDerivedRoles } = await import("./derivedRoles");
      const dr = await computeDerivedRoles(user.id, user.schoolId!);
      derivedKinds = dr.activeKinds as Set<string>;
    } catch { /* non-fatal */ }
  }

  let displayLabel: string;
  if (isPrincipal) {
    displayLabel = "Principal";
  } else if (isTeacher) {
    const parts: string[] = [];
    if (derivedKinds.has("HEAD_OF_DEPT"))                           parts.push("HOD");
    if (derivedKinds.has("CLASS_TEACHER"))                          parts.push("Class Teacher");
    if (derivedKinds.has("DORM_MASTER"))                            parts.push("Dorm Master");
    if (derivedKinds.has("SUBJECT_TEACHER") && parts.length === 0)  parts.push("Teacher");
    displayLabel = parts.join(" & ") || "Teacher";
  } else {
    displayLabel = await getRoleDisplayLabel(user);
  }

  return {
    isPrincipal, isDeputy, isTeacher, isAdminStaff,
    assignedRoleNames, derivedKinds, displayLabel,
    isLibrarian, isMatron, modulePermissions,
  };
}
