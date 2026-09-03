/**
 * GET /api/parent/calendar
 *
 * Returns CalendarEvent rows visible to parents (audience EVERYONE or
 * PARENTS_ONLY) for the authenticated parent's school, ordered by date
 * ascending. STAFF_ONLY events are never returned.
 *
 * Requirements: 11.1, 11.2
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

  const events = await prisma.calendarEvent.findMany({
    where: {
      schoolId: parent.schoolId,
      audience: { in: ["EVERYONE", "PARENTS_ONLY"] },
    },
    orderBy: { date: "asc" },
    select: {
      id:          true,
      title:       true,
      description: true,
      date:        true,
      type:        true,
      audience:    true,
    },
  });

  return NextResponse.json({ events });
}
