import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { resolveRecipients } from "@/lib/messaging/resolve";
import { deliverMessage } from "@/lib/messaging/deliver";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import type { MessageChannel, Prisma } from "@prisma/client";

const sendSchema = z.object({
  descriptors:    z.array(z.record(z.unknown())).min(1, "At least one recipient required."),
  channel:        z.enum(["SMS", "WHATSAPP"]),
  body:           z.string().trim().min(1, "Message body cannot be empty."),
  // The Composer sends the value of a <input type="datetime-local">, which has
  // no timezone suffix, so this accepts any string Date can parse and the
  // range check below rejects the ones that are not real dates.
  scheduledAt:    z.string().min(1).optional(),
  attachmentUrl:  z.string().url().optional(),
  attachmentName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { descriptors, channel, body, scheduledAt, attachmentUrl, attachmentName } = parsed.data;

  let scheduledDate: Date | null = null;
  if (scheduledAt) {
    scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid schedule date." }, { status: 400 });
    }
  }

  // ── WhatsApp: still requires a configured per-school key ─────────────────
  if (channel === "WHATSAPP") {
    const integration = await getSchoolIntegrationKey(user.schoolId!, "WHATSAPP");
    if (!integration) {
      return NextResponse.json(
        { error: "WhatsApp integration is not configured for this school. Go to Settings → Integrations to add a key." },
        { status: 422 }
      );
    }
  }

  const isScheduledForFuture = !!scheduledDate && scheduledDate > new Date();

  // Resolving now lets deliverMessage() below reuse this instead of hitting
  // the database again — only worth doing for an immediate send; a scheduled
  // message gets resolved fresh by the flush job when it's actually due.
  const resolvedEarly = isScheduledForFuture
    ? null
    : await resolveRecipients(descriptors as never, user.schoolId!);

  // Create the Message row
  const message = await prisma.message.create({
    data: {
      schoolId:            user.schoolId!,
      senderUserId:        user.id,
      channel:             channel as MessageChannel,
      body,
      recipientDescriptor: descriptors as Prisma.InputJsonValue,
      recipientSummary:    "Sending…",
      attachmentUrl:       attachmentUrl  ?? null,
      attachmentName:      attachmentName ?? null,
      scheduledAt:         scheduledDate,
      status:              "PENDING",
    },
  });

  // Record which custom groups this message targets. The group DELETE route
  // refuses to remove a group that a pending scheduled message still points
  // at — without these rows that guard never fired, and deleting the group
  // left the scheduled message resolving to nobody.
  const groupIds = [
    ...new Set(
      (descriptors as { type?: string; groupId?: string }[])
        .filter((d) => d.type === "group" && typeof d.groupId === "string")
        .map((d) => d.groupId as string)
    ),
  ];
  if (groupIds.length > 0) {
    await prisma.messageRecipientGroup.createMany({
      data: groupIds.map((groupId) => ({ messageId: message.id, groupId })),
      skipDuplicates: true,
    });
  }

  // If scheduled, return immediately — the flush job dispatches it when due
  if (isScheduledForFuture) {
    return NextResponse.json({ messageId: message.id, scheduled: true }, { status: 202 });
  }

  // ── Immediate send — fire-and-forget ─────────────────────────────────────
  void deliverMessage(message.id, resolvedEarly ?? undefined).catch(async () => {
    await prisma.message
      .update({ where: { id: message.id }, data: { status: "FAILED" } })
      .catch(() => {});
  });

  return NextResponse.json({ messageId: message.id }, { status: 202 });
}
