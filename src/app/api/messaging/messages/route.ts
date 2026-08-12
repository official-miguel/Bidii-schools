import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page     = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const q        = searchParams.get("q")?.trim() ?? "";
  const status   = searchParams.get("status") ?? undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");

  const where = {
    schoolId: user.schoolId!,
    ...(status ? { status: status as never } : {}),
    ...(q ? { OR: [
      { body:             { contains: q, mode: "insensitive" as const } },
      { recipientSummary: { contains: q, mode: "insensitive" as const } },
      { sender: { email:  { contains: q, mode: "insensitive" as const } } },
    ]} : {}),
    ...(dateFrom || dateTo ? { createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
    }} : {}),
  };

  const [total, messages] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: {
        id:               true,
        channel:          true,
        status:           true,
        recipientSummary: true,
        body:             true,
        createdAt:        true,
        scheduledAt:      true,
        sender:           { select: { email: true } },
      },
    }),
  ]);

  const result = messages.map((m) => ({
    ...m,
    body:        m.body.slice(0, 120),
    senderEmail: m.sender.email,
  }));

  return NextResponse.json({ messages: result, total });
}
