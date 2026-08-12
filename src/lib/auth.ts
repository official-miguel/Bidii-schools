import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash, createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role, User } from "@prisma/client";

export const SESSION_COOKIE = "bidii_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/// Creates a session row and returns the raw token to set as a cookie.
/// Only the hash is stored, so a DB leak doesn't expose usable session tokens.
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }
  return session.user;
});

/// Throws-free guard for API routes: returns the user if their role matches,
/// otherwise null so the route can respond 401/403 itself.
export async function requireRole(...roles: Role[]): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}

/**
 * A User whose schoolId is guaranteed to be a non-null string.
 * Used by school-scoped API routes so Prisma where-clauses satisfy the
 * `string | StringFilter | undefined` constraint without null.
 */
export type SchoolUser = Omit<User, "schoolId"> & { schoolId: string };

/**
 * Like requireRole but also asserts schoolId is present.
 * Returns null for SUPER_ADMIN accounts (no school) or unauthenticated requests.
 */
export async function requireSchoolRole(...roles: Role[]): Promise<SchoolUser | null> {
  const user = await requireRole(...roles);
  if (!user || !user.schoolId!) return null;
  return user as SchoolUser;
}

// ---------------------------------------------------------------------------
// Offline auth token — signed server-side at login, cached client-side in
// IndexedDB so the user can be identified without a network round-trip.
// ---------------------------------------------------------------------------

export type OfflineTokenPayload = {
  id:          "current";
  userId:      string;
  schoolId:    string | null;
  role:        string;
  email:       string;
  staffRoleId: string | null;
  expiresAt:   number;
  sig:         string;
};

/**
 * Build a signed offline token for a user. Called server-side at login.
 * schoolId is null for SUPER_ADMIN accounts (not scoped to any school).
 */
export function buildOfflineToken(user: User): OfflineTokenPayload {
  const secret    = process.env.SESSION_SECRET ?? "dev-secret";
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const schoolId  = user.schoolId! ?? null;
  const payload   = `${user.id}|${schoolId ?? ""}|${user.role}|${user.email}|${expiresAt}`;
  const sig       = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    id:          "current",
    userId:      user.id,
    schoolId,
    role:        user.role,
    email:       user.email,
    staffRoleId: user.staffRoleId ?? null,
    expiresAt,
    sig,
  };
}
