/**
 * src/lib/messaging/deliver.ts
 *
 * The single delivery path for a Message row. Immediate sends, the scheduled
 * flush cron and the "retry failed" action all go through here, so they can
 * never drift apart again — before this existed, the cron and the retry route
 * dispatched SMS through the per-school integration key while the Composer
 * used the platform key, which meant every scheduled or retried SMS failed
 * with "SMS integration is not configured for this school" and skipped the
 * placeholder substitution.
 *
 * Both channels dispatch on the school's OWN provider credentials
 * (SchoolIntegration), set by a super admin on the school's SMS tab. The
 * platform-level key is reserved for forgot-password OTP and is never used
 * here. There is no local credit gate either: each school's balance lives in
 * its own Mobivas account, so a dry account surfaces as a real per-recipient
 * provider error, logged below like any other failure.
 *
 * SERVER-SIDE ONLY.
 */

import { prisma } from "@/lib/prisma";
import { resolveRecipients, buildRecipientSummary } from "@/lib/messaging/resolve";
import type { ResolvedRecipient } from "@/lib/messaging/resolve";
import { dispatchMessage } from "@/lib/messaging/dispatch";
import { applyPlaceholders } from "@/lib/messaging/placeholders";
import type { MessageChannel } from "@prisma/client";

/** Marker phone used for log rows that were never dialled (skipped recipients). */
export const NO_PHONE = "N/A";

/**
 * Substitute both the static placeholders (/name, /class, /Admission, …) and
 * the dynamic group tokens (/bomname) for one recipient.
 */
export function personalise(body: string, r: Pick<ResolvedRecipient, "label" | "groupTokens" | "context">): string {
  let out = body;
  if (r.groupTokens) {
    for (const [token, name] of Object.entries(r.groupTokens)) {
      out = out.split(token).join(name || "[unknown]");
    }
  }
  return applyPlaceholders(out, r.context ?? { name: r.label });
}

/** Send one already-personalised body on this school's own provider key. */
async function dispatchOne(schoolId: string, channel: MessageChannel, phone: string, body: string) {
  return dispatchMessage(schoolId, channel, phone, body);
}

export type DeliveryOutcome = { sent: number; failed: number; skipped: number };

/**
 * Resolve, personalise, dispatch and log every recipient of a message, then
 * settle the aggregate status.
 *
 * `preResolved` lets the immediate-send path reuse a resolution it already
 * did instead of hitting the database twice.
 */
export async function deliverMessage(
  messageId: string,
  preResolved?: Awaited<ReturnType<typeof resolveRecipients>>,
  opts?: { keepSummary?: boolean }
): Promise<DeliveryOutcome> {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return { sent: 0, failed: 0, skipped: 0 };

  const { schoolId, channel, body } = message;

  const { resolved, skipped } =
    preResolved ?? (await resolveRecipients(message.recipientDescriptor as never, schoolId));

  // The exam-results sender already stores the student's own name as the
  // summary, which reads better in history than "1 recipient".
  if (!opts?.keepSummary) {
    await prisma.message.update({
      where: { id: messageId },
      data:  {
        recipientSummary: await buildRecipientSummary(
          message.recipientDescriptor as never,
          resolved.length,
          schoolId
        ),
      },
    });
  }

  const settings  = await prisma.messagingSettings.findUnique({ where: { schoolId } });
  const batchSize = settings?.batchSize ?? 50;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < resolved.length; i += batchSize) {
    const batch = resolved.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (recipient) => {
        const personalBody = personalise(body, recipient);
        const result = await dispatchOne(schoolId, channel, recipient.phone, personalBody);

        await prisma.messageLog.create({
          data: {
            messageId,
            schoolId,
            channel,
            phone:          recipient.phone,
            recipientLabel: recipient.label,
            status:         result.status,
            providerMsgId:  result.providerMsgId ?? null,
            errorDetail:    result.errorDetail   ?? null,
          },
        });

        if (result.status === "SENT") sent++;
        else failed++;
      })
    );
  }

  // Recipients with no number on file — logged so they show in the detail panel.
  for (const { label, reason } of skipped) {
    await prisma.messageLog.create({
      data: {
        messageId,
        schoolId,
        channel,
        phone:          NO_PHONE,
        recipientLabel: label,
        status:         "FAILED",
        errorDetail:    reason,
      },
    });
  }

  await prisma.message.update({
    where: { id: messageId },
    data:  { status: sent > 0 ? "SENT" : "FAILED" },
  });

  return { sent, failed, skipped: skipped.length };
}

/**
 * Re-dispatch only the recipients whose log row is FAILED and that actually
 * have a number. Rows marked FAILED because there was no number on file are
 * not dialable and are left alone.
 */
export async function retryFailedLogs(messageId: string): Promise<DeliveryOutcome> {
  const message = await prisma.message.findUnique({
    where:   { id: messageId },
    include: { logs: { where: { status: "FAILED", phone: { not: NO_PHONE } } } },
  });
  if (!message) return { sent: 0, failed: 0, skipped: 0 };

  const { schoolId, channel, body } = message;

  let sent = 0;
  let failed = 0;

  for (const log of message.logs) {
    // The per-recipient personalisation is not recoverable from the log row,
    // so a retry re-sends the stored body with the recipient's own name.
    const personalBody = personalise(body, { label: log.recipientLabel, context: { name: log.recipientLabel } });
    const result = await dispatchOne(schoolId, channel, log.phone, personalBody);

    await prisma.messageLog.update({
      where: { id: log.id },
      data: {
        status:        result.status,
        providerMsgId: result.providerMsgId ?? undefined,
        errorDetail:   result.errorDetail   ?? null,
      },
    });

    if (result.status === "SENT") sent++;
    else failed++;
  }

  if (sent > 0) {
    await prisma.message.update({ where: { id: messageId }, data: { status: "SENT" } });
  }

  return { sent, failed, skipped: 0 };
}
