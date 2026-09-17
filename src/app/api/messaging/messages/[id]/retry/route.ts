import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { retryFailedLogs, NO_PHONE, smsSegments, smsBalance } from "@/lib/messaging/deliver";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const message = await prisma.message.findUnique({
    where:   { id: params.id },
    include: { logs: { where: { status: "FAILED", phone: { not: NO_PHONE } } } },
  });

  if (!message || message.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rows failed for "no contact number on file" carry no dialable number, so
  // they are excluded above — retrying them would fail forever.
  if (message.logs.length === 0) {
    return NextResponse.json({ error: "No failed recipients with a contact number to retry." }, { status: 400 });
  }

  if (message.channel === "SMS") {
    const estimate = message.logs.length * smsSegments(message.body);
    const balance  = await smsBalance(message.schoolId);
    if (estimate > balance) {
      return NextResponse.json(
        { error: `Not enough SMS units to retry. Balance: ${balance}, needed: ${estimate}.` },
        { status: 422 }
      );
    }
  }

  // Fire-and-forget retry
  void retryFailedLogs(message.id).catch(() => {});

  return NextResponse.json({ queued: message.logs.length }, { status: 202 });
}
