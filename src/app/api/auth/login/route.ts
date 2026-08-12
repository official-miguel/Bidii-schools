/**
 * POST /api/auth/login
 *
 * Password-based login for all roles.
 *
 * SUPER_ADMIN:
 *   Looked up by email alone (no schoolId scope) before the per-school flow.
 *   The platform school row satisfies the DB FK but is never exposed to users.
 *
 * First-login flow for teachers / staff:
 *   • The initial password is the school's slug (e.g. "kianyaga").
 *   • mustChangePassword is set to true on account creation.
 *   • On first login the server authenticates normally and returns
 *     { mustChangePassword: true } so the client shows the set-password screen.
 *   • After the teacher sets a new password, mustChangePassword is cleared and
 *     the school slug can NEVER be re-used again
 *     (enforced in /api/auth/change-password).
 *
 * Per-school email model:
 *   Same email at two schools → if exactly one match, log in directly;
 *   if multiple, return requiresSchoolSlug=true.
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

// ── Explicit user shape ───────────────────────────────────────────────────────
type UserRow = {
  id:                 string;
  email:              string;
  passwordHash:       string | null;
  role:               string;
  mustChangePassword: boolean;
  isActive:           boolean;
  schoolId:           string;
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
    // ── SUPER_ADMIN fast-path ──────────────────────────────────────────────
    // SUPER_ADMIN is not scoped to any school — look up by email alone first.
    // This runs before the per-school flow so the platform school slug can
    // never be guessed by a regular user to bypass school scoping.
    if (isEmail) {
      const candidate = await prisma.user.findFirst({
        where:  { email: identifier, role: "SUPER_ADMIN", isActive: true },
        select: userSelect,
      });
      if (candidate) {
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
        // Slug-scoped lookup
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
        // No slug — find all candidates, disambiguate by password
        let candidates: UserRow[] = [];

        if (isEmail) {
          // Exclude SUPER_ADMIN — already handled above
          candidates = await prisma.user.findMany({
            where:  { email: identifier, isActive: true, role: { not: "SUPER_ADMIN" } },
            select: userSelect,
          });
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
              // Check against school slug (first-login path)
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

  // ── Password verification (for non-pre-verified paths) ───────────────────
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
    offlineToken = buildOfflineToken(user as Parameters<typeof buildOfflineToken>[0]);
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
