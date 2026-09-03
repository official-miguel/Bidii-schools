export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const notification = await prisma.parentNotification.findUnique({
    where: { id: params.id },
  });

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (notification.parentId !== parent.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.parentNotification.update({
    where: { id: params.id },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
