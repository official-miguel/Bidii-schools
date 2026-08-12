import { NextRequest, NextResponse } from "next/server";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin }          from "@/lib/super-admin";

/** GET /api/super-admin/audit — paginated audit log */
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const targetId = sp.get("targetId") ?? undefined;
  const action   = sp.get("action")   ?? undefined;
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit    = 50;
  const skip     = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (targetId) where.targetId = targetId;
  if (action)   where.action   = { contains: action, mode: "insensitive" };

  const [logs, total] = await Promise.all([
    prisma.superAdminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.superAdminAuditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
