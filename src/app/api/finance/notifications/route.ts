/**
 * GET /api/finance/notifications — List unread finance notifications
 *
 * Returns the 50 most recent unread FinanceNotification rows for the caller's
 * school, ordered by createdAt descending. Used to populate the notification
 * feed on the Bursar dashboard.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const notifications = await prisma.financeNotification.findMany({
    where:   { schoolId, isRead: false },
    orderBy: { createdAt: "desc" },
    take:    50,
    select: {
      id:        true,
      type:      true,
      message:   true,
      createdAt: true,
      studentId: true,
      student: {
        select: { fullName: true, admissionNumber: true },
      },
    },
  });

  return NextResponse.json({
    notifications,
    unreadCount: notifications.length,
  });
}
