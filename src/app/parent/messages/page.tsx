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

  const studentIds = parent.students.map((ps) => ps.studentId);

  const [rawMessages, disciplineRecords] = await Promise.all([
    prisma.message.findMany({
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
    }),
    studentIds.length === 0
      ? Promise.resolve([])
      : prisma.disciplineRecord.findMany({
          where:   { studentId: { in: studentIds }, isVisibleToParent: true },
          orderBy: { createdAt: "desc" },
          take:    50,
          select: {
            id:            true,
            offence:       true,
            description:   true,
            status:        true,
            createdAt:     true,
            student:       { select: { fullName: true } },
          },
        }),
  ]);

  // Marks this visit as "caught up" for the unread-messages nav badge —
  // fire-and-forget, doesn't block the page render.
  void prisma.parent.update({
    where: { id: parent.id },
    data:  { messagesLastReadAt: new Date() },
  }).catch(() => {});

  // Serialise dates for the client component
  const messageItems: MessageItem[] = rawMessages.map((m) => ({
    id:               m.id,
    body:             m.body,
    recipientSummary: m.recipientSummary,
    channel:          m.channel as string,
    status:           m.status as string,
    createdAt:        m.createdAt.toISOString(),
    sender:           { name: m.sender?.email ?? null },
    kind:             "MESSAGE",
  }));

  const disciplineItems: MessageItem[] = disciplineRecords.map((d) => ({
    id:               `discipline-${d.id}`,
    body:             d.description || d.offence,
    recipientSummary: "",
    channel:          "IN_APP",
    status:           d.status,
    createdAt:        d.createdAt.toISOString(),
    sender:           { name: "School" },
    kind:             "DISCIPLINE",
    disciplineStatus: d.status,
    studentName:      d.student.fullName,
  }));

  const messages = [...messageItems, ...disciplineItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

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
