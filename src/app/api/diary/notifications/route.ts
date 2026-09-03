import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER", "STUDENT", "PARENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10), 50);

  const [notifications, unreadCount] = await Promise.all([
    prisma.diaryNotification.findMany({
      where:   { userId: user.id, schoolId: user.schoolId },
      orderBy: { createdAt: "desc" },
      take:    limit,
    }),
    prisma.diaryNotification.count({
      where: { userId: user.id, schoolId: user.schoolId, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER", "STUDENT", "PARENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const notificationIds: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications as read
    await prisma.diaryNotification.updateMany({
      where: {
        id:       { in: notificationIds },
        userId:   user.id,
        schoolId: user.schoolId,
      },
      data: { isRead: true },
    });
  } else {
    // Mark all as read
    await prisma.diaryNotification.updateMany({
      where: { userId: user.id, schoolId: user.schoolId, isRead: false },
      data:  { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
