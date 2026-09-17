/**
 * GET /api/super-admin/schools/[id]/sms-activity
 *
 * Replaces the old per-school SMS "wallet" (balance/allocate/ledger) —
 * every school sends through the one shared Mobivas account configured at
 * /super-admin/settings/sms, and Mobivas tracks that account's real balance
 * on its own dashboard. There is nothing to allocate here; this route is
 * read-only visibility into what this school has actually sent through it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }                    from "@/lib/prisma";
import { requireSuperAdmin }         from "@/lib/super-admin";
import { getPlatformSmsStatus }      from "@/lib/platform-sms";

const PAGE_SIZE = 30;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await prisma.school.findUnique({
    where:  { id: params.id },
    select: { id: true },
  });
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const where = { schoolId: params.id, channel: "SMS" as const };

  const [platform, sent30d, failed30d, totalAllTime, logs, total] = await Promise.all([
    getPlatformSmsStatus(),
    prisma.messageLog.count({ where: { ...where, status: "SENT",   createdAt: { gte: since } } }),
    prisma.messageLog.count({ where: { ...where, status: "FAILED", createdAt: { gte: since } } }),
    prisma.messageLog.count({ where }),
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: {
        id:             true,
        recipientLabel: true,
        phone:          true,
        status:         true,
        errorDetail:    true,
        createdAt:      true,
      },
    }),
    prisma.messageLog.count({ where }),
  ]);

  // Mask phone numbers the same way the school-side message detail panel does.
  const maskedLogs = logs.map((l) => ({
    ...l,
    phone: l.phone.length > 4 ? `${"*".repeat(l.phone.length - 4)}${l.phone.slice(-4)}` : l.phone,
  }));

  return NextResponse.json({
    platform,
    stats: { sent30d, failed30d, totalAllTime },
    logs: maskedLogs,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
