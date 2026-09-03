export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST() {
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await prisma.parentNotification.updateMany({
    where: { parentId: parent.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
