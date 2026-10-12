import { NextRequest, NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/logout  { pushEndpoint?: string }
 *
 * pushEndpoint is this device's Web Push endpoint, sent by signOut() in
 * src/lib/signOut.ts. Unlinking it here stops the signed-out user's
 * notifications from appearing on a shared phone. The endpoint itself is an
 * unguessable capability URL, so holding it is proof enough of the device.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    const body = await req.json().catch(() => null);
    const pushEndpoint = body?.pushEndpoint;
    if (typeof pushEndpoint === "string" && pushEndpoint.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: pushEndpoint } }).catch(() => {});
    }
    await destroySession(token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
