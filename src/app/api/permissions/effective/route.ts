/**
 * GET /api/permissions/effective
 *
 * Returns the current user's effective permission set — both assigned
 * (StaffRole-based) and derived (computed from operational assignments).
 * Used exclusively by the client-side usePermissionCache hook to refresh
 * the local 10-minute cache. School isolation is enforced from the session.
 *
 * Response shape matches CachedPermissions (minus the cache timestamps which
 * the hook adds client-side).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions, getAssignedRoleNames } from "@/lib/permissions";
import { computeDerivedRoles } from "@/lib/derivedRoles";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Assigned module permissions from StaffRole rows
  const [modulePerms, assignedRoleNames] = await Promise.all([
    getEffectivePermissions(user),
    getAssignedRoleNames(user),
  ]);

  // Derived role kinds from operational assignments
  let derivedKinds: string[] = [];
  if (user.role === "TEACHER" || user.role === "ADMIN_STAFF") {
    try {
      const derived = await computeDerivedRoles(user.id, user.schoolId!);
      derivedKinds = [...derived.activeKinds];
    } catch {
      // Non-fatal — user may have no teacher record
    }
  } else if (user.role === "PRINCIPAL") {
    derivedKinds = [];
  }

  // Resolve teacher record name for display
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { fullName: true },
  }).catch(() => null);

  return NextResponse.json({
    role:          user.role,
    displayName:   teacher?.fullName ?? user.email,
    email:         user.email,
    assignedRoles: assignedRoleNames,
    derivedKinds,
    modules:       modulePerms,
    // schoolId intentionally not returned — client should already have it
    // from the offline token, not from this endpoint
  });
}
