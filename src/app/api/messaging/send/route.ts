import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { resolveRecipients, buildRecipientSummary } from "@/lib/messaging/resolve";
import { dispatchMessage, dispatchPlatformSms } from "@/lib/messaging/dispatch";
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

/** Number of SMS segments a message body occupies. */
function smsSegments(bodyLength: number): number {
  return Math.ceil(bodyLength / 160) || 1;
}

export async function POST(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { descriptors, channel, body, scheduledAt, attachmentUrl, attachmentName } = parsed.data;

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

  // ── SMS: resolve recipients BEFORE creating the Message row so we can ────
  // ── check the wallet balance and bail early if insufficient. ─────────────
  let resolvedEarly: Awaited<ReturnType<typeof resolveRecipients>> | null = null;

  if (channel === "SMS") {
    resolvedEarly = await resolveRecipients(descriptors as never, user.schoolId!);
    const recipientCount = resolvedEarly.resolved.length;
    const estimatedUnits = recipientCount * smsSegments(body.length);

    // Load wallet (no wallet row = 0 balance; do NOT auto-create)
    const wallet = await prisma.schoolSmsWallet.findUnique({
      where:  { schoolId: user.schoolId! },
      select: { unitsRemaining: true },
    });
    const balance = wallet?.unitsRemaining ?? 0;

    if (balance < estimatedUnits) {
      return NextResponse.json(
        {
          error:
            `Not enough SMS units. Current balance: ${balance}. ` +
            `This message needs approximately ${estimatedUnits}. ` +
            `Ask your Super Admin to top up.`,
        },
        { status: 422 }
      );
    }
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

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

  // If scheduled, return immediately — cron job dispatches later
  if (scheduledDate && scheduledDate > new Date()) {
    return NextResponse.json({ messageId: message.id }, { status: 202 });
  }

  // ── Immediate send — fire-and-forget ─────────────────────────────────────
  (async () => {
    // For SMS we already resolved above; for WhatsApp resolve here as before
    const { resolved, skipped } = resolvedEarly ??
      await resolveRecipients(descriptors as never, user.schoolId!);

    // Update recipient summary
    const summary = buildRecipientSummary(descriptors as never, resolved.length);
    await prisma.message.update({
      where: { id: message.id },
      data:  { recipientSummary: summary },
    });

    const settings = await prisma.messagingSettings.findUnique({
      where: { schoolId: user.schoolId! },
    });
    const batchSize = settings?.batchSize ?? 50;

    let allFailed = true;

    // Track per-recipient segment counts for accurate wallet deduction
    const sentSegments: number[] = [];

    // Dispatch in batches
    for (let i = 0; i < resolved.length; i += batchSize) {
      const batch = resolved.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ({ label, phone, groupTokens }) => {
          // Personalise body with group tokens
          let personalBody = body;
          if (groupTokens) {
            for (const [token, name] of Object.entries(groupTokens)) {
              personalBody = personalBody.split(token).join((name as string | null | undefined) || "[unknown]");
            }
          }

          // ── SMS: use platform dispatch; WhatsApp: use per-school dispatch ──
          const result = channel === "SMS"
            ? await dispatchPlatformSms(phone, personalBody)
            : await dispatchMessage(user.schoolId!, channel as MessageChannel, phone, personalBody);

          await prisma.messageLog.create({
            data: {
              messageId:      message.id,
              schoolId:       user.schoolId!,
              channel:        channel as MessageChannel,
              phone,
              recipientLabel: label,
              status:         result.status,
              providerMsgId:  result.providerMsgId ?? null,
              errorDetail:    result.errorDetail   ?? null,
            },
          });

          if (result.status === "SENT") {
            allFailed = false;
            if (channel === "SMS") {
              sentSegments.push(smsSegments(personalBody.length));
            }
          }
        })
      );
    }

    // Log skipped recipients
    for (const { label, reason } of skipped) {
      await prisma.messageLog.create({
        data: {
          messageId:      message.id,
          schoolId:       user.schoolId!,
          channel:        channel as MessageChannel,
          phone:          "N/A",
          recipientLabel: label,
          status:         "FAILED",
          errorDetail:    reason,
        },
      });
    }

    // ── SMS wallet deduction (only for actually-sent messages) ─────────────
    if (channel === "SMS" && sentSegments.length > 0) {
      const actualUnitsConsumed = sentSegments.reduce((a, b) => a + b, 0);

      await prisma.$transaction(async (tx) => {
        // Atomic decrement
        const updated = await tx.schoolSmsWallet.update({
          where: { schoolId: user.schoolId! },
          data:  { unitsRemaining: { decrement: actualUnitsConsumed } },
          select: { unitsRemaining: true },
        });

        // Append-only ledger row
        await tx.smsWalletTransaction.create({
          data: {
            schoolId:  user.schoolId!,
            type:      "DEDUCTION",
            units:     -actualUnitsConsumed,
            reason:    "bulk_send",
            reference: message.id,
            balanceAfter: updated.unitsRemaining,
          },
        });
      });
    }

    // Update aggregate message status
    await prisma.message.update({
      where: { id: message.id },
      data:  { status: allFailed ? "FAILED" : "SENT" },
    });
  })().catch(async () => {
    await prisma.message.update({
      where: { id: message.id },
      data:  { status: "FAILED" },
    }).catch(() => {});
  });

  return NextResponse.json({ messageId: message.id }, { status: 202 });
}
