import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { resolveRecipients, buildRecipientSummary } from "@/lib/messaging/resolve";
import { dispatchMessage } from "@/lib/messaging/dispatch";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import type { MessageChannel, Prisma } from "@prisma/client";

const sendSchema = z.object({
  descriptors:    z.array(z.record(z.unknown())).min(1, "At least one recipient required."),
  channel:        z.enum(["SMS", "WHATSAPP"]),
  body:           z.string().trim().min(1, "Message body cannot be empty."),
  scheduledAt:    z.string().datetime().optional(),
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

  // Verify integration key exists
  const integration = await getSchoolIntegrationKey(user.schoolId!, channel as "SMS" | "WHATSAPP");
  if (!integration) {
    return NextResponse.json(
      { error: `${channel} integration is not configured for this school. Go to Settings → Integrations to add a key.` },
      { status: 422 }
    );
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

  // Create the Message row immediately
  const message = await prisma.message.create({
    data: {
      schoolId: user.schoolId!,
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

  // If scheduled, return immediately — the cron job will dispatch
  if (scheduledDate && scheduledDate > new Date()) {
    return NextResponse.json({ messageId: message.id }, { status: 202 });
  }

  // Immediate send — fire-and-forget background dispatch
  (async () => {
    const { resolved, skipped } = await resolveRecipients(
      descriptors as never,
      user.schoolId!
    );

    // Update recipient summary
    const summary = buildRecipientSummary(descriptors as never, resolved.length);
    await prisma.message.update({
      where: { id: message.id },
      data:  { recipientSummary: summary },
    });

    // Get the settings for batch size
    const settings = await prisma.messagingSettings.findUnique({
      where: { schoolId: user.schoolId! },
    });
    const batchSize = settings?.batchSize ?? 50;

    let allFailed = true; // true until first SENT result

    // Dispatch in batches
    for (let i = 0; i < resolved.length; i += batchSize) {
      const batch = resolved.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ({ label, phone, groupTokens }) => {
          // Personalise body: substitute dynamic group tokens (e.g. /bomname → "Alice")
          let personalBody = body;
          if (groupTokens) {
            for (const [token, name] of Object.entries(groupTokens)) {
              personalBody = personalBody.split(token).join(name || "[unknown]");
            }
          }
          const result = await dispatchMessage(user.schoolId!, channel as MessageChannel, phone, personalBody);
          await prisma.messageLog.create({
            data: {
              messageId:      message.id,
              schoolId: user.schoolId!,
              channel:        channel as MessageChannel,
              phone,
              recipientLabel: label,
              status:         result.status,
              providerMsgId:  result.providerMsgId ?? null,
              errorDetail:    result.errorDetail   ?? null,
            },
          });
          if (result.status === "SENT") allFailed = false;
        })
      );
    }

    // Create skipped log entries
    for (const { label, reason } of skipped) {
      await prisma.messageLog.create({
        data: {
          messageId:      message.id,
          schoolId: user.schoolId!,
          channel:        channel as MessageChannel,
          phone:          "N/A",
          recipientLabel: label,
          status:         "FAILED",
          errorDetail:    reason,
        },
      });
    }

    // Update aggregate status using allFailed flag
    const newStatus = allFailed ? "FAILED" : "SENT";

    await prisma.message.update({
      where: { id: message.id },
      data:  { status: newStatus },
    });
  })().catch(async () => {
    await prisma.message.update({
      where: { id: message.id },
      data:  { status: "FAILED" },
    }).catch(() => {});
  });

  return NextResponse.json({ messageId: message.id }, { status: 202 });
}
