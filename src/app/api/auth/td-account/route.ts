/**
 * POST /api/auth/td-account
 *
 * Asked by the Trillionaire Designs finance app so it shows the "Bidii super
 * admin" button only to people who have an active super admin account here.
 * The request carries a token signed with the shared TD_SSO_SECRET, so nobody
 * else can use this to find out which emails have accounts.
 *
 * Body: { token } → { exists: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTdToken } from "@/lib/td-auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const check = typeof body?.token === "string" ? verifyTdToken(body.token, "bidii-account-check") : null;
  if (!check) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE lower(email) = ${check.email}
      AND role::text = 'SUPER_ADMIN'
      AND "isActive" = true
    LIMIT 1
  `;
  return NextResponse.json({ exists: rows.length > 0 }, { headers: { "Cache-Control": "no-store" } });
}
