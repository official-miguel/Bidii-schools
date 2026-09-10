/**
 * /parent/messages
 *
 * Server component that shows the 50 most recent school messages to the
 * authenticated parent. Messages are school-wide communication blasts
 * (SMS / email) with a human-readable recipient summary.
 *
 * Requirements: 11.3, 11.4
 */

import { redirect } from "next/navigation";
import { requireParent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import MessageList, { type MessageItem } from "@/components/parent/MessageList";

export const dynamic = "force-dynamic";

export default async function ParentMessagesPage() {
  const parent = await requireParent();
  if (!parent) redirect("/login");

  const rawMessages = await prisma.message.findMany({
    where:   { schoolId: parent.schoolId },
    orderBy: { createdAt: "desc" },
    take:    50,
    select: {
      id:               true,
      body:             true,
      recipientSummary: true,
      channel:          true,
      status:           true,
      createdAt:        true,
      sender: { select: { email: true } },
    },
  });

  // Serialise dates for the client component
  const messages: MessageItem[] = rawMessages.map((m) => ({
    id:               m.id,
    body:             m.body,
    recipientSummary: m.recipientSummary,
    channel:          m.channel as string,
    status:           m.status as string,
    createdAt:        m.createdAt.toISOString(),
    sender:           { name: m.sender?.email ?? null },
  }));

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Messages</h1>
        <p className="text-sm text-slate mt-1">
          School announcements and messages sent to parents.
        </p>
      </div>

      {messages.length === 0 ? (
        /* Empty state — matches spec wording exactly */
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-foreground">
            💬 No messages
          </p>
          <p className="text-xs text-slate">
            School announcements and messages will appear here.
          </p>
        </div>
      ) : (
        <MessageList messages={messages} />
      )}
    </div>
  );
}
