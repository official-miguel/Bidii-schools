/**
 * Super-admin utility helpers.
 *
 * requireSuperAdmin() — use in every API route and server layout under
 * /super-admin. Returns the User row if the session is valid and the role
 * is SUPER_ADMIN, otherwise returns null so callers can respond 401/403.
 *
 * logAudit() — append a row to SuperAdminAuditLog for any sensitive action.
 */

import { requireRole } from "@/lib/auth";
import { prisma }      from "@/lib/prisma";

export async function requireSuperAdmin() {
  return requireRole("SUPER_ADMIN");
}

export async function logAudit(
  adminId:    string,
  action:     string,
  targetType?: string,
  targetId?:   string,
  metadata?:   Record<string, unknown>,
) {
  await prisma.superAdminAuditLog.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { adminId, action, targetType, targetId, metadata: metadata as any },
  });
}
