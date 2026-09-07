/**
 * GET /api/messaging/scheduled-flush
 *
 * Cron-triggered route that dispatches all scheduled messages whose
 * scheduledAt <= now().
 *
 * Protected by Authorization: Bearer ${CRON_SECRET} — same pattern as
 * /api/finance/jobs/debtor-refresh. The Vercel cron entry in vercel.json
 * must include the header (see vercel.json).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRecipients, buildRecipientSummary } from "@/lib/messaging/resolve";
import { dispatchMessage } from "@/lib/messaging/dispatch";

// Never statically pre-rendered — always runs at request time
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth: require CRON_SECRET bearer token ───────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Reject if CRON_SECRET is not set or the header doesn't match
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // take: 100 — cap messages processed per cron tick to bound memory and execution time.
  const due = await prisma.message.findMany({
    where: {
      status:      "PENDING",
      scheduledAt: { lte: new Date() },
    },
    take: 100,  // process at most 100 messages per cron invocation; remainder picked up next minute
  });

  let dispatched = 0;

  for (const message of due) {
    try {
      const { resolved, skipped } = await resolveRecipients(
        message.recipientDescriptor as never,
        message.schoolId
      );

      const summary = buildRecipientSummary(message.recipientDescriptor as never, resolved.length);
      await prisma.message.update({
        where: { id: message.id },
        data:  { recipientSummary: summary },
      });

      const settings = await prisma.messagingSettings.findUnique({
        where: { schoolId: message.schoolId },
      });
      const batchSize = settings?.batchSize ?? 50;

      for (let i = 0; i < resolved.length; i += batchSize) {
        const batch = resolved.slice(i, i + batchSize);
        await Promise.all(batch.map(async ({ label, phone }) => {
          const result = await dispatchMessage(message.schoolId, message.channel, phone, message.body);
          await prisma.messageLog.create({
            data: {
              messageId:      message.id,
              schoolId:       message.schoolId,
              channel:        message.channel,
              phone,
              recipientLabel: label,
              status:         result.status,
              providerMsgId:  result.providerMsgId ?? null,
              errorDetail:    result.errorDetail   ?? null,
            },
          });
        }));
      }

      for (const { label, reason } of skipped) {
        await prisma.messageLog.create({
          data: {
            messageId:      message.id,
            schoolId:       message.schoolId,
            channel:        message.channel,
            phone:          "N/A",
            recipientLabel: label,
            status:         "FAILED",
            errorDetail:    reason,
          },
        });
      }

      const failedCount = await prisma.messageLog.count({ where: { messageId: message.id, status: "FAILED" } });
      const totalCount  = await prisma.messageLog.count({ where: { messageId: message.id } });
      await prisma.message.update({
        where: { id: message.id },
        data:  { status: failedCount === totalCount ? "FAILED" : "SENT" },
      });

      dispatched++;
    } catch {
      await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED" } }).catch(() => {});
    }
  }

  return NextResponse.json({ dispatched });
}
