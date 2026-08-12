/**
 * src/lib/apiAuth.ts
 *
 * Server-side API route helpers that enforce authentication AND school-scoped
 * permission checks before any database query executes.
 *
 * Every API route that touches school data must call enforceAuth() first.
 * Nothing about school isolation is optional or decorative — the schoolId
 * is ALWAYS derived from the authenticated session, never from request params.
 *
 * Pattern for a protected route:
 *
 *   export async function GET(req: NextRequest) {
 *     const { user, schoolId, error } = await enforceAuth();
 *     if (error) return error;
 *
 *     // Gate on a specific module/action:
 *     const permError = await requireModuleAccess(user, "STUDENTS", "view");
 *     if (permError) return permError;
 *
 *     const students = await prisma.student.findMany({
 *       where: { schoolId, archivedAt: null },   // ← always bind schoolId
 *     });
 *     return NextResponse.json(students);
 *   }
 */

import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import type { Module } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions, type PermissionAction } from "@/lib/permissions";

// ─────────────────────────────────────────────────────────────────────────────
// enforceAuth
//
// Returns { user, schoolId } on success, or { error: NextResponse } to return
// directly from the route. Never returns both.
// ─────────────────────────────────────────────────────────────────────────────

interface AuthSuccess {
  user:     User;
  schoolId: string;
  error:    null;
}

interface AuthFailure {
  user:     null;
  schoolId: null;
  error:    NextResponse;
}

export async function enforceAuth(): Promise<AuthSuccess | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      schoolId: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!user.isActive) {
    return {
      user: null,
      schoolId: null,
      error: NextResponse.json(
        { error: "Your account has been deactivated. Please contact your administrator." },
        { status: 403 }
      ),
    };
  }
  return { user, schoolId: user.schoolId!, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireModuleAccess
//
// Gate an API route on a module+action pair. PRINCIPAL always passes.
// Returns null on success (caller may proceed), or a 403 NextResponse.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireModuleAccess(
  user:    User,
  module:  Module,
  action:  PermissionAction = "view"
): Promise<NextResponse | null> {
  if (user.role === "PRINCIPAL") return null;

  const perms = await getEffectivePermissions(user);
  const entry = perms[module];

  if (!entry) {
    return NextResponse.json(
      { error: `You don't have permission to ${action} ${module}.` },
      { status: 403 }
    );
  }

  const granted = (() => {
    switch (action) {
      case "view":      return entry.canView      || entry.canManage;
      case "create":    return entry.canCreate    || entry.canManage;
      case "edit":      return entry.canEdit      || entry.canManage;
      case "delete":    return entry.canDelete    || entry.canManage;
      case "approve":   return entry.canApprove   || entry.canManage;
      case "export":    return entry.canExport    || entry.canManage;
      case "print":     return entry.canPrint     || entry.canManage;
      case "manage":    return entry.canManage;
      case "configure": return entry.canConfigure || entry.canManage;
      case "ai":        return entry.canAIAccess;
      default:          return false;
    }
  })();

  if (!granted) {
    return NextResponse.json(
      { error: `You don't have permission to ${action} ${module}.` },
      { status: 403 }
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// requirePrincipal
//
// Shorthand for routes that are Principal-only.
// ─────────────────────────────────────────────────────────────────────────────

export async function requirePrincipal(): Promise<
  { user: User; schoolId: string; error: null } |
  { user: null;  schoolId: null;   error: NextResponse }
> {
  const result = await enforceAuth();
  if (result.error) return result;

  if (result.user.role !== "PRINCIPAL") {
    return {
      user: null,
      schoolId: null,
      error: NextResponse.json({ error: "Principal access required." }, { status: 403 }),
    };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// requirePrincipalOrPermission
//
// Passes for PRINCIPAL unconditionally, or for any user who has the
// specified module permission. Useful for routes like staff listing that
// both PRINCIPAL and Secretary can access.
// ─────────────────────────────────────────────────────────────────────────────

export async function requirePrincipalOrPermission(
  module: Module,
  action: PermissionAction = "view"
): Promise<
  { user: User; schoolId: string; error: null } |
  { user: null;  schoolId: null;   error: NextResponse }
> {
  const result = await enforceAuth();
  if (result.error) return result;

  if (result.user.role === "PRINCIPAL") return result;

  const permError = await requireModuleAccess(result.user, module, action);
  if (permError) {
    return { user: null, schoolId: null, error: permError };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// assertSchoolMatch
//
// Validates that a resource's schoolId matches the authenticated user's.
// Use after fetching a resource to prevent IDOR (cross-school access via ID).
// Returns a 403 response if the schools don't match, null otherwise.
// ─────────────────────────────────────────────────────────────────────────────

export function assertSchoolMatch(
  resourceSchoolId: string,
  userSchoolId:     string
): NextResponse | null {
  if (resourceSchoolId !== userSchoolId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
    // Intentional 404 not 403 — don't reveal that the resource exists
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// logAuditEvent — fire-and-forget audit logging for API routes
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export async function logAuditEvent(opts: {
  schoolId:      string;
  performedById: string;
  action:        string;
  detail:        Record<string, unknown>;
}) {
  prisma.auditLog.create({
    data: {
      schoolId:      opts.schoolId,
      performedById: opts.performedById,
      action:        opts.action,
      detail:        opts.detail as object,
    },
  }).catch(() => {
    // Non-fatal — audit failure must never block the main operation
  });
}
