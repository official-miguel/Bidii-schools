/**
 * POST /api/auth/td-sso
 *
 * Arrival point for the "Bidii super admin" button in the Trillionaire
 * Designs finance app. That app posts a signed one-time pass (see
 * src/lib/td-auth.ts); if it is valid, unused, and names an active super
 * admin here, a normal Bidii session is created and the person lands on
 * /super-admin without typing a password.
 *
 * Any failure sends them to the ordinary login page, where the shared
 * password still works.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { logAudit } from "@/lib/super-admin";
import { verifySsoTicket } from "@/lib/td-auth";

function toLogin(req: NextRequest) {
  return NextResponse.redirect(new URL("/login?sso=failed", req.url), 303);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const raw = form?.get("ticket");
  if (typeof raw !== "string") return toLogin(req);

  const ticket = verifySsoTicket(raw);
  if (!ticket) return toLogin(req);

  // One-time use: a second arrival with the same pass is refused.
  try {
    await prisma.ssoTicketUse.create({
      data: { jti: ticket.jti, expiresAt: new Date(ticket.exp * 1000) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return toLogin(req);
    throw err;
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE lower(email) = ${ticket.email}
      AND role::text = 'SUPER_ADMIN'
      AND "isActive" = true
    LIMIT 1
  `;
  const admin = rows[0];
  if (!admin) return toLogin(req);

  const token = await createSession(admin.id);
  await logAudit(admin.id, "SUPER_ADMIN_TD_SSO_LOGIN", "user", admin.id).catch(() => {});

  // Housekeeping: passes older than a day are no longer needed.
  prisma.ssoTicketUse
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } })
    .catch(() => {});

  const res = NextResponse.redirect(new URL("/super-admin", req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
