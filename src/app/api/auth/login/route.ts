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
 *
 * Rate limiting:
 *   - 10 attempts per IP per 15 minutes (IP-level, pre-auth)
 *   - 5 failed attempts per identifier per 15 minutes (identifier-level)
 *   - Successful login resets the per-identifier counter
 *   - Both limiters use Upstash Redis (distributed, works across serverless instances)
 *   - If Redis is not configured the endpoint REJECTS (fail-closed)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  buildOfflineToken,
} from "@/lib/auth";
import { checkLoginRateLimit, resetLoginIdentifierLimit } from "@/lib/rateLimit";

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

// ── Extract real client IP (handles Vercel/reverse-proxy headers) ─────────────
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

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

  // ── Rate limiting (must happen before any DB work) ────────────────────────
  const ip          = getClientIp(req);
  const rlResult    = await checkLoginRateLimit(ip, identifier);
  if (!rlResult.allowed) {
    if (rlResult.reason === "redis_unavailable") {
      console.error("[LOGIN] Rate limiter unavailable — Redis not configured (UPSTASH_REDIS_REST_URL/TOKEN missing). Login rejected.");
      return NextResponse.json(
        { error: "Authentication service temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    // ip_limit or identifier_limit
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 15 minutes before trying again." },
      { status: 429 }
    );
  }

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

        if (candidates.length === 1) {
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

          if (matched.length === 0) {
            // No staff match — fall through to parent fallback below
          } else if (matched.length === 1) {
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
    console.error("[LOGIN] DB lookup failed:", { code: (err as NodeJS.ErrnoException)?.code ?? "UNKNOWN" });
    return NextResponse.json(
      { error: "Authentication service temporarily unavailable." },
      { status: 503 }
    );
  }

  // ── Parent fallback — phone number + admission number (or personal password) ──
  if (!user) {
    // Parents always log in by phone number (never by email address)
    if (!isEmail) {
      const parent = await prisma.parent.findFirst({
        where: { phone: identifier, user: { isActive: true } },
        include: {
          user: {
            select: {
              id: true, email: true, passwordHash: true, role: true,
              mustChangePassword: true, isActive: true, schoolId: true,
              staffRoleId: true, createdAt: true, updatedAt: true,
              avatarUrl: true, avatarStoragePath: true,
            },
          },
        },
      });

      if (parent?.user) {
        const ok = await verifyPassword(password, parent.user.passwordHash ?? "").catch(() => false);
        if (ok) {
          user = parent.user as unknown as UserRow;
          passwordAlreadyVerified = true;
        }
      }
    }
  }

  if (!user || !user.isActive) return invalid();

  // ── Password verification ─────────────────────────────────────────────────
  if (!passwordAlreadyVerified) {
    if (!user.passwordHash) return invalid();
    // Try the password as-is first. If that fails, also try without a leading
    // "@" — first-login accounts have the school slug hashed as the password
    // (e.g. "bidii"), but the UI hint and welcome email show "@bidii", so
    // users naturally type the "@" variant. Trying both covers both cases.
    const valid =
      (await verifyPassword(password, user.passwordHash).catch(() => false)) ||
      (password.startsWith("@") &&
        (await verifyPassword(password.slice(1), user.passwordHash).catch(() => false)));
    if (!valid) return invalid();
  }

  // ── Reset per-identifier rate limit counter on successful login ───────────
  // Best-effort; a Redis error here must not break the login flow.
  await resetLoginIdentifierLimit(identifier).catch(() => {});

  // ── Session + offline token ───────────────────────────────────────────────
  let token: string;
  let offlineToken: ReturnType<typeof buildOfflineToken>;
  try {
    token        = await createSession(user.id);
    offlineToken = buildOfflineToken(user as unknown as Parameters<typeof buildOfflineToken>[0]);
  } catch (err) {
    console.error("[LOGIN] Session creation failed:", { code: (err as NodeJS.ErrnoException)?.code ?? "UNKNOWN" });
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
    maxAge:   Math.floor(SESSION_TTL_MS / 1000),
  });

  return res;
}
