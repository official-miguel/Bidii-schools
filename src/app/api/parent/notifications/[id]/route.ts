export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent } from "@/lib/parentAuth";

/**
 * DELETE /api/parent/notifications/[id] — dismiss one parent notification.
 *
 * The bell lets a parent dismiss a notification, which previously had nowhere
 * to go for parent rows: the row was removed from the client store and then
 * reappeared on the next poll. Ownership is checked against the session's
 * parent id, never an id from the request.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.parentNotification.findFirst({
    where:  { id: params.id, parentId: parent.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.parentNotification.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
