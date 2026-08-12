import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { buildResultsMessage } from "@/lib/messaging/examResults";
import { dispatchMessage } from "@/lib/messaging/dispatch";
import {
  initBatch, incrementSent, incrementFailed, addSkipped, markDone,
} from "@/lib/messaging/batchProgress";
import { randomBytes } from "crypto";
import type { MessageChannel } from "@prisma/client";

/** GET /api/messaging/exam-results?periodId=xxx — summary stats */
export async function GET(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json({ error: "periodId required." }, { status: 400 });

  const period = await prisma.assessmentPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, name: true, academicYear: true, schoolId: true },
  });
  if (!period || period.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }

  // Count distinct students with at least one result in this period
  const studentIds = await prisma.assessmentItem.findMany({
    where:  { periodId, schoolId: user.schoolId! },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  const total = studentIds.length;
  const ids   = studentIds.map((s) => s.studentId);

  const withContact = await prisma.student.count({
    where: { id: { in: ids }, parentContact: { not: null } },
  });

  return NextResponse.json({
    period,
    totalStudents:  total,
    withContact,
    withoutContact: total - withContact,
  });
}

const sendSchema = z.object({
  periodId:    z.string().cuid(),
  channel:     z.enum(["SMS", "WHATSAPP"]),
  closingLine: z.string().trim().optional(),
});

/** POST /api/messaging/exam-results — bulk send results */
export async function POST(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { periodId, channel, closingLine } = parsed.data;

  const period = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }

  const settings = await prisma.messagingSettings.findUnique({ where: { schoolId: user.schoolId! } });
  const closing  = closingLine ?? settings?.resultsClosing ?? "Thank you for your continued support.";
  const batchSize = settings?.batchSize ?? 50;

  const studentRows = await prisma.assessmentItem.findMany({
    where:    { periodId, schoolId: user.schoolId! },
    select:   { studentId: true },
    distinct: ["studentId"],
  });
  const studentIds = studentRows.map((s) => s.studentId);

  const batchId = randomBytes(8).toString("hex");
  initBatch(batchId, studentIds.length);

  // Fire-and-forget bulk send
  (async () => {
    for (let i = 0; i < studentIds.length; i += batchSize) {
      const slice = studentIds.slice(i, i + batchSize);
      await Promise.all(slice.map(async (studentId) => {
        const payload = await buildResultsMessage(studentId, periodId, user.schoolId!, closing);

        if (!payload.phone) {
          addSkipped(batchId, payload.recipientLabel, "no contact number on file");
          return;
        }

        // Create a per-student message row for history
        const message = await prisma.message.create({
          data: {
            schoolId: user.schoolId!,
            senderUserId:        user.id,
            channel:             channel as MessageChannel,
            body:                payload.body,
            recipientDescriptor: [{ type: "student", studentId }],
            recipientSummary:    payload.recipientLabel,
            status:              "PENDING",
          },
        });

        const result = await dispatchMessage(user.schoolId!, channel as MessageChannel, payload.phone, payload.body);

        await prisma.messageLog.create({
          data: {
            messageId:      message.id,
            schoolId: user.schoolId!,
            channel:        channel as MessageChannel,
            phone:          payload.phone,
            recipientLabel: payload.recipientLabel,
            status:         result.status,
            providerMsgId:  result.providerMsgId ?? null,
            errorDetail:    result.errorDetail   ?? null,
          },
        });

        await prisma.message.update({
          where: { id: message.id },
          data:  { status: result.status },
        });

        if (result.status === "SENT") incrementSent(batchId);
        else incrementFailed(batchId);
      }));
    }
    markDone(batchId);
  })().catch(() => markDone(batchId));

  return NextResponse.json({ batchId }, { status: 202 });
}
