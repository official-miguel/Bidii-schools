/**
 * PATCH /api/finance/notifications/[id]/read — Mark a notification as read
 *
 * Sets isRead = true on the FinanceNotification. Scoped to caller.schoolId
 * so cross-school reads are not possible (returns 404 on mismatch).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const notification = await prisma.financeNotification.findFirst({
    where:  { id: params.id, schoolId },
    select: { id: true },
  });

  if (!notification) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.financeNotification.update({
    where: { id: params.id },
    data:  { isRead: true },
  });

  return NextResponse.json({ success: true });
}
