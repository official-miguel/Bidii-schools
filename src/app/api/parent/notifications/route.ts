export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const pageParam = req.nextUrl.searchParams.get("page");
  const moduleParam = req.nextUrl.searchParams.get("module");

  const page = Math.max(1, Number(pageParam) || 1);
  const skip = (page - 1) * 25;

  const where = {
    parentId: parent.id,
    ...(moduleParam ? { module: moduleParam } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.parentNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: 25,
    }),
    prisma.parentNotification.count({ where }),
    prisma.parentNotification.count({
      where: { parentId: parent.id, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, total, unreadCount });
}
