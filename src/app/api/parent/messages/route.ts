/**
 * GET /api/parent/messages
 *
 * Returns the 50 most recent Message rows for the authenticated parent's
 * school, ordered by createdAt descending. Messages are school-wide
 * communication blasts — no audience filter is applied here because every
 * message sent through the school may be relevant to parents.
 *
 * recipientSummary is a human-readable string describing who the message was
 * sent to (stored on the Message model at send time).
 *
 * Requirements: 11.3
 */

import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const messages = await prisma.message.findMany({
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
      sender: {
        select: { email: true },
      },
    },
  });

  return NextResponse.json({ messages });
}
