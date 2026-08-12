import { redirect } from "next/navigation";
import { Shield, Users, Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultStaffRoles, MODULE_INFO, ALL_MODULES } from "@/lib/permissions";
import type { Module } from "@prisma/client";
import PermissionMatrixClient from "@/components/permissions/PermissionMatrixClient";
import AuditLogTable from "@/components/permissions/AuditLogTable";

export default async function StaffRolesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const schoolId = user.schoolId!;
  await ensureDefaultStaffRoles(schoolId);

  const [roles, auditLogs, staffUsers] = await Promise.all([
    prisma.staffRole.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
      include: {
        permissions: true,
        _count: { select: { users: true } },
        userRoles: { select: { userId: true } },
      },
    }),
    prisma.permissionAuditLog.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        performedBy: { select: { email: true } },
        targetUser:  { select: { email: true } },
      },
    }).catch(() => []),
    prisma.user.findMany({
      where: { schoolId, role: { in: ["ADMIN_STAFF", "TEACHER"] }, isActive: true },
      select: {
        id:          true,
        email:       true,
        role:        true,
        staffRoleId: true,
        userStaffRoles: { select: { staffRoleId: true } },
        teacher: {
          select: {
            fullName:       true,
            staffId:        true,
            classTeacherOf: { select: { name: true } },
          },
        },
      },
      orderBy: { email: "asc" },
    }),
  ]);

  // Build serialisable data for the client component
  const rolesData = roles.map((r) => ({
    id:          r.id,
    name:        r.name,
    description: r.description,
    userCount:   r._count.users + r.userRoles.length, // legacy + multi-role
    permissions: Object.fromEntries(
      r.permissions.map((p) => [
        p.module,
        {
          canView:      p.canView,
          canCreate:    (p as { canCreate?: boolean }).canCreate    ?? p.canManage,
          canEdit:      (p as { canEdit?: boolean }).canEdit        ?? p.canManage,
          canDelete:    (p as { canDelete?: boolean }).canDelete     ?? p.canManage,
          canApprove:   (p as { canApprove?: boolean }).canApprove   ?? false,
          canExport:    (p as { canExport?: boolean }).canExport     ?? p.canManage,
          canPrint:     (p as { canPrint?: boolean }).canPrint       ?? p.canManage,
          canManage:    p.canManage,
          canConfigure: (p as { canConfigure?: boolean }).canConfigure ?? false,
          canAIAccess:  (p as { canAIAccess?: boolean }).canAIAccess   ?? false,
        },
      ])
    ) as Record<string, {
      canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
      canApprove: boolean; canExport: boolean; canPrint: boolean;
      canManage: boolean; canConfigure: boolean; canAIAccess: boolean;
    }>,
  }));

  const modulesData = ALL_MODULES.map((m) => ({
    key:         m,
    label:       MODULE_INFO[m as Module].label,
    description: MODULE_INFO[m as Module].description,
    hub:         MODULE_INFO[m as Module].hub,
  }));

  const auditData = auditLogs.map((a) => ({
    id:            a.id,
    action:        a.action,
    performedBy:   a.performedBy.email,
    targetUser:    a.targetUser?.email ?? null,
    staffRoleId:   a.staffRoleId ?? null,
    module:        a.module ?? null,
    changes:       a.changes as Record<string, unknown> | null,
    createdAt:     a.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-teal" />
            <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Staff Roles &amp; Permissions</h1>
          </div>
          <p className="text-slate text-sm dark:text-dark-muted">
            Create and configure roles. Permissions take effect immediately — no log-out required.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate dark:text-dark-muted">
          <Users className="h-4 w-4" />
          <span>
            {staffUsers.filter((u) => u.role === "ADMIN_STAFF").length} admin
            {" · "}
            {staffUsers.filter((u) => u.role === "TEACHER").length} teacher
            {staffUsers.filter((u) => u.role === "TEACHER").length !== 1 ? "s" : ""}
          </span>
          <span className="mx-1">·</span>
          <span>{roles.length} role{roles.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="bg-card border border-line rounded-xl p-4 shadow-xs
                       dark:bg-dark-surface dark:border-dark-border"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink dark:text-dark-text text-sm truncate">{role.name}</p>
                {role.description && (
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5 line-clamp-2">{role.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs bg-teal-50 text-teal px-2 py-0.5 rounded-full font-medium dark:bg-teal/15">
                {role._count.users + role.userRoles.length} user{role._count.users + role.userRoles.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-slate dark:text-dark-muted">
                {role.permissions.filter((p) => p.canView || p.canManage).length}/{ALL_MODULES.length} modules
              </span>
              {role.permissions.some((p) => p.canManage) && (
                <span className="text-[10px] bg-teal/10 text-teal px-1.5 py-0.5 rounded-full">Can manage</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Full permission matrix (client component) */}
      <PermissionMatrixClient
        roles={rolesData}
        modules={modulesData}
        staffUsers={staffUsers}
        principalId={user.id}
        schoolId={schoolId}
      />

      {/* Audit log */}
      {auditData.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-slate" />
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">Permission audit log</h2>
          </div>
          <AuditLogTable entries={auditData} />
        </div>
      )}
    </div>
  );
}
