/**
 * src/lib/identity.ts
 *
 * Shared identifier-resolution logic used by both:
 *   • /api/auth/login          (password-based login)
 *   • /api/auth/forgot-password/request  (OTP request)
 *   • /api/auth/forgot-password/verify   (OTP verify)
 *
 * Extracts the per-school lookup that was previously duplicated inside
 * login/route.ts so there is one place to maintain phone/email → User
 * resolution.
 *
 * SERVER-SIDE ONLY.
 */

import { prisma } from "./prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResolvedUser = {
  id:                 string;
  email:              string;
  passwordHash:       string | null;
  role:               string;
  mustChangePassword: boolean;
  isActive:           boolean;
  schoolId:           string | null;
  staffRoleId:        string | null;
  createdAt:          Date;
  updatedAt:          Date;
  avatarUrl:          string | null;
  avatarStoragePath:  string | null;
};

export type ResolveResult =
  | { kind: "found";             user: ResolvedUser }
  | { kind: "not_found" }
  | { kind: "requires_school_slug" }  // same email/phone at >1 school, no slug given
  | { kind: "db_error";          message: string };

// Prisma select shape (all fields needed by both login and OTP flows)
const userSelect = {
  id:                 true,
  email:              true,
  passwordHash:       true,
  role:               true,
  mustChangePassword: true,
  isActive:           true,
  schoolId:           true,
  staffRoleId:        true,
  createdAt:          true,
  updatedAt:          true,
  avatarUrl:          true,
  avatarStoragePath:  true,
} as const;

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Resolves an identifier (email or phone) to a single active, non-SUPER_ADMIN
 * User row.
 *
 * Resolution order:
 *   1. If schoolSlug provided → look up only within that school.
 *   2. Otherwise → find all candidates, return "requires_school_slug" if
 *      there are multiple matches (same phone/email at >1 school).
 *
 * Does NOT verify passwords — that stays in the caller.
 * Does NOT handle the SUPER_ADMIN fast-path — that stays in login/route.ts
 * because it uses $queryRaw to bypass the generated enum.
 */
export async function resolveUserByIdentifier(
  identifier: string,
  schoolSlug?: string
): Promise<ResolveResult> {
  const isEmail = identifier.includes("@");

  try {
    // ── Slug-scoped lookup ────────────────────────────────────────────────
    if (schoolSlug) {
      const school = await prisma.school.findUnique({
        where:  { slug: schoolSlug },
        select: { id: true },
      });
      if (!school) return { kind: "not_found" };

      let user: ResolvedUser | null = null;

      if (isEmail) {
        user = await prisma.user.findFirst({
          where:  { schoolId: school.id, email: identifier, isActive: true },
          select: userSelect,
        });
      } else {
        // Phone → Teacher (covers PRINCIPAL/TEACHER/ADMIN_STAFF/BURSAR)
        const teacher = await prisma.teacher.findFirst({
          where:  { schoolId: school.id, phone: identifier, archivedAt: null },
          select: { userId: true },
        });
        if (teacher?.userId) {
          user = await prisma.user.findUnique({
            where:  { id: teacher.userId },
            select: userSelect,
          });
        }
        // Phone → Parent fallback
        if (!user) {
          const parent = await prisma.parent.findFirst({
            where:   { phone: identifier, user: { isActive: true, schoolId: school.id } },
            include: { user: { select: userSelect } },
          });
          if (parent?.user) user = parent.user as ResolvedUser;
        }
      }

      if (!user || !user.isActive) return { kind: "not_found" };
      return { kind: "found", user };
    }

    // ── No slug: find all non-SUPER_ADMIN candidates ──────────────────────
    let candidates: ResolvedUser[] = [];

    if (isEmail) {
      // Raw SQL to exclude SUPER_ADMIN without touching the generated enum
      candidates = await prisma.$queryRaw<ResolvedUser[]>`
        SELECT
          id, email, "passwordHash", role::text AS role,
          "mustChangePassword", "isActive", "schoolId",
          "staffRoleId", "createdAt", "updatedAt",
          "avatarUrl", "avatarStoragePath"
        FROM "User"
        WHERE email = ${identifier}
          AND role::text != 'SUPER_ADMIN'
          AND "isActive" = true
      `;
    } else {
      // Phone → Teacher rows first
      const teachers = await prisma.teacher.findMany({
        where:  { phone: identifier, archivedAt: null },
        select: { userId: true },
      });
      const teacherUserIds = teachers.map((t) => t.userId).filter(Boolean) as string[];

      // Phone → Parent rows
      const parents = await prisma.parent.findMany({
        where:   { phone: identifier, user: { isActive: true } },
        include: { user: { select: userSelect } },
      });
      const parentUsers = parents.map((p) => p.user).filter(Boolean) as ResolvedUser[];

      if (teacherUserIds.length > 0) {
        const teacherUsers = await prisma.user.findMany({
          where:  { id: { in: teacherUserIds }, isActive: true },
          select: userSelect,
        });
        candidates = [...teacherUsers, ...parentUsers];
      } else {
        candidates = parentUsers;
      }
    }

    if (candidates.length === 0) return { kind: "not_found" };
    if (candidates.length === 1) return { kind: "found", user: candidates[0] };

    // Multiple schools → caller must provide slug
    return { kind: "requires_school_slug" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { kind: "db_error", message: msg };
  }
}

// ── Phone resolver ────────────────────────────────────────────────────────────

/**
 * Given a resolved User, returns the phone number associated with their
 * account: Teacher.phone for staff roles, Parent.phone for PARENT role.
 * Returns null if no phone is on file.
 */
export async function resolveUserPhone(userId: string, role: string): Promise<string | null> {
  if (role === "PARENT") {
    const parent = await prisma.parent.findFirst({
      where:  { userId },
      select: { phone: true },
    });
    return parent?.phone ?? null;
  }

  // PRINCIPAL / TEACHER / ADMIN_STAFF / BURSAR — all Teacher rows
  const teacher = await prisma.teacher.findFirst({
    where:  { userId },
    select: { phone: true },
  });
  return teacher?.phone ?? null;
}
