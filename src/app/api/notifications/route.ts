import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/notifications — the current user's notification inbox, newest first. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(notifications);
}

/**
 * POST /api/notifications
 *   { action: "read-all" }  — marks every unread notification read.
 *   { action: "clear-all" } — deletes every notification for this user.
 *
 * clear-all exists because the bell's "Clear all" button used to empty only
 * the client store, so the next 30-second poll faithfully restored everything
 * the user had just cleared.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  if (body?.action === "read-all") {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "clear-all") {
    // Scoped to the caller's own rows — userId comes from the session, never
    // from the request body.
    const { count } = await prisma.notification.deleteMany({
      where: { userId: user.id },
    });
    return NextResponse.json({ ok: true, deleted: count });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
