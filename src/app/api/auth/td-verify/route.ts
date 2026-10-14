/**
 * POST /api/auth/td-verify
 *
 * The first time a Bidii super admin signs in to the Trillionaire Designs
 * finance app, that app checks the password here, so the person keeps the
 * password they already use for Bidii. After that, the password lives in
 * that app and Bidii follows it (src/lib/td-auth.ts).
 *
 * Body: { token, password } → { ok: boolean }
 *   token: signed with the shared TD_SSO_SECRET (audience
 *   "bidii-password-check"), naming the email. Only that app can call this.
 *
 * Failed checks count towards the normal sign-in lockout for that email.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { checkLoginBlocked, recordFailedLogin, clearFailedLogins } from "@/lib/rateLimit";
import { verifyTdToken } from "@/lib/td-auth";

const CALLER = "td-app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const check = typeof body?.token === "string" ? verifyTdToken(body.token, "bidii-password-check") : null;
  if (!check || typeof body?.password !== "string" || !body.password) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await checkLoginBlocked(CALLER, check.email);
  if (blocked.blocked) return NextResponse.json({ ok: false, blocked: true }, { status: 429 });

  const rows = await prisma.$queryRaw<{ passwordHash: string | null }[]>`
    SELECT "passwordHash" FROM "User"
    WHERE lower(email) = ${check.email}
      AND role::text = 'SUPER_ADMIN'
      AND "isActive" = true
    LIMIT 1
  `;
  const hash = rows[0]?.passwordHash;
  const ok = !!hash && (await verifyPassword(body.password, hash).catch(() => false));

  if (ok) await clearFailedLogins(CALLER, check.email).catch(() => {});
  else await recordFailedLogin(CALLER, check.email).catch(() => {});

  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
