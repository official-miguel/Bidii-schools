import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { dispatchMessage } from "@/lib/messaging/dispatch";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    include: { logs: { where: { status: "FAILED" } } },
  });

  if (!message || message.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (message.logs.length === 0) {
    return NextResponse.json({ error: "No failed recipients to retry." }, { status: 400 });
  }

  // Fire-and-forget retry
  (async () => {
    for (const log of message.logs) {
      const result = await dispatchMessage(user.schoolId, log.channel, log.phone, message.body);
      await prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status:        result.status,
          providerMsgId: result.providerMsgId ?? undefined,
          errorDetail:   result.errorDetail   ?? null,
        },
      });
    }
    // Refresh aggregate status
    const remaining = await prisma.messageLog.count({
      where: { messageId: message.id, status: "FAILED" },
    });
    if (remaining === 0) {
      await prisma.message.update({ where: { id: message.id }, data: { status: "SENT" } });
    }
  })().catch(() => {});

  return NextResponse.json({ queued: message.logs.length }, { status: 202 });
}
