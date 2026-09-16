import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** PATCH /api/notifications/[id] — mark one notification read. */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.notification.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const notification = await prisma.notification.update({
    where: { id: params.id },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json(notification);
}

/** DELETE /api/notifications/[id] — dismiss one notification. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.notification.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.notification.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
