/**
 * POST /api/auth/login
 *
 * Password-based login for all roles.
 *
 * SUPER_ADMIN:
 *   Looked up via raw SQL (bypasses the Prisma-generated Role enum so the
 *   query works even before `prisma generate` picks up SUPER_ADMIN).
 *
 * First-login flow for teachers / staff:
 *   • Initial password = school slug (e.g. "kianyaga").
 *   • mustChangePassword=true forces a password set on first login.
 *   • School slug can never be reused as a password afterward.
 *
 * Per-school email model:
 *   Same email at two schools → requiresSchoolSlug=true until disambiguated.
 *
 * Accepts email OR phone number as the identifier.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  buildOfflineToken,
} from "@/lib/auth";

// ── Explicit user shape (role as plain string — avoids generated-enum issues) ─
type UserRow = {
  id:                 string;
  email:              string;
  passwordHash:       string | null;
  role:               string;
  mustChangePassword: boolean;
  isActive:           boolean;
  schoolId:           string | null;   // null for SUPER_ADMIN
  staffRoleId:        string | null;
  createdAt:          Date;
  updatedAt:          Date;
  avatarUrl:          string | null;
  avatarStoragePath:  string | null;
};

// ── Prisma select shape ───────────────────────────────────────────────────────
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

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number."),
  password:   z.string().min(1, "Enter your password."),
  schoolSlug: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { identifier, password, schoolSlug } = parsed.data;
  const invalid = () =>
    NextResponse.json({ error: "Incorrect email/phone or password." }, { status: 401 });

  const isEmail = identifier.includes("@");

  let user: UserRow | null = null;
  let passwordAlreadyVerified = false;

  try {
    // ── SUPER_ADMIN fast-path (raw SQL — bypasses Prisma enum validation) ──
    // Must run before the per-school flow. Uses $queryRaw so it works even
    // when the generated Prisma client was built before SUPER_ADMIN was added.
    if (isEmail) {
      const rows = await prisma.$queryRaw<UserRow[]>`
        SELECT
          id, email, "passwordHash", role::text AS role,
          "mustChangePassword", "isActive", "schoolId",
          "staffRoleId", "createdAt", "updatedAt",
          "avatarUrl", "avatarStoragePath"
        FROM "User"
        WHERE email = ${identifier}
          AND role::text = 'SUPER_ADMIN'
          AND "isActive" = true
        LIMIT 1
      `;

      if (rows.length > 0) {
        const candidate = rows[0];
        if (!candidate.passwordHash) return invalid();
        const ok = await verifyPassword(password, candidate.passwordHash).catch(() => false);
        if (!ok) return invalid();
        user = candidate;
        passwordAlreadyVerified = true;
      }
    }

    // ── Per-school lookup (all other roles) ───────────────────────────────
    if (!user) {
      if (schoolSlug) {
        const school = await prisma.school.findUnique({
          where:  { slug: schoolSlug },
          select: { id: true },
        });
        if (!school) return invalid();

        if (isEmail) {
          user = await prisma.user.findFirst({
            where:  { schoolId: school.id, email: identifier, isActive: true },
            select: userSelect,
          });
        } else {
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
        }
      } else {
        // No slug — find all non-super-admin candidates
        let candidates: UserRow[] = [];

        if (isEmail) {
          // Use raw SQL to exclude SUPER_ADMIN without touching the enum type
          candidates = await prisma.$queryRaw<UserRow[]>`
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
          const teachers = await prisma.teacher.findMany({
            where:  { phone: identifier, archivedAt: null },
            select: { userId: true },
          });
          const userIds = teachers.map((t) => t.userId).filter(Boolean) as string[];
          if (userIds.length > 0) {
            candidates = await prisma.user.findMany({
              where:  { id: { in: userIds }, isActive: true },
              select: userSelect,
            });
          }
        }

        if (candidates.length === 0) {
          return invalid();
        } else if (candidates.length === 1) {
          user = candidates[0];
        } else {
          // Multiple schools — verify password to find the right candidate
          const matched: UserRow[] = [];
          for (const candidate of candidates) {
            if (!candidate.passwordHash) {
              if (!candidate.schoolId) continue; // SUPER_ADMIN has no school
              const school = await prisma.school.findUnique({
                where:  { id: candidate.schoolId },
                select: { slug: true },
              });
              if (school) {
                const norm = password.replace(/^@/, "");
                if (norm === school.slug || password === school.slug) {
                  matched.push(candidate);
                }
              }
              continue;
            }
            const ok = await verifyPassword(password, candidate.passwordHash);
            if (ok) matched.push(candidate);
          }

          if (matched.length === 0) return invalid();
          if (matched.length === 1) {
            user = matched[0];
            passwordAlreadyVerified = true;
          } else {
            return NextResponse.json(
              {
                error: "Your account is linked to more than one school. Please enter your school identifier to continue.",
                requiresSchoolSlug: true,
              },
              { status: 409 }
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[LOGIN] DB error:", err);
    return NextResponse.json(
      { error: "Authentication service temporarily unavailable." },
      { status: 503 }
    );
  }

  if (!user || !user.isActive) return invalid();

  // ── Password verification ─────────────────────────────────────────────────
  if (!passwordAlreadyVerified) {
    if (!user.passwordHash) return invalid();
    const valid = await verifyPassword(password, user.passwordHash).catch(() => false);
    if (!valid) return invalid();
  }

  // ── Session + offline token ───────────────────────────────────────────────
  let token: string;
  let offlineToken: ReturnType<typeof buildOfflineToken>;
  try {
    token        = await createSession(user.id);
    // buildOfflineToken expects a User-shaped object; schoolId may be null for SUPER_ADMIN
    offlineToken = buildOfflineToken(user as unknown as Parameters<typeof buildOfflineToken>[0]);
  } catch (err) {
    console.error("[LOGIN] Session error:", err);
    return NextResponse.json(
      { error: "Failed to create session. Please try again." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({
    role:               user.role,
    mustChangePassword: user.mustChangePassword,
    offlineToken,
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });

  return res;
}
