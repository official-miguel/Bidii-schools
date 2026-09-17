/**
 * GET /api/super-admin/audit — paginated history of super-admin actions.
 *
 * The full history is the owner's view (Settings → History): it records what
 * every super admin has done, so an ordinary super admin must not be able to
 * read it wholesale.
 *
 * The one exception is the Modules page's own audit tab, which is open to
 * every super admin and only ever asks for MODULE_TOGGLED. Rather than break
 * that, non-owners are allowed through for exactly the actions listed below
 * and rejected for anything else.
 *
 * SuperAdminAuditLog stores only adminId, so the admin's email is resolved
 * here in one extra query and attached to each row — the history is useless
 * if it can't say who did the thing.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }                    from "@/lib/prisma";
import { requireSuperAdmin, requireSuperAdminOwner } from "@/lib/super-admin";

const PAGE_SIZE = 50;

/** Actions a non-owner super admin may read, for UI they already have. */
const NON_OWNER_READABLE_ACTIONS = new Set(["MODULE_TOGGLED"]);

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const targetId = sp.get("targetId") ?? undefined;
  const action   = sp.get("action")?.trim() || undefined;
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));

  const owner = await requireSuperAdminOwner();
  if (!owner) {
    const admin = await requireSuperAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!action || !NON_OWNER_READABLE_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const where: Record<string, unknown> = {};
  if (targetId) where.targetId = targetId;
  if (action)   where.action   = { contains: action, mode: "insensitive" };

  const [logs, total] = await Promise.all([
    prisma.superAdminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
    }),
    prisma.superAdminAuditLog.count({ where }),
  ]);

  const adminIds = [...new Set(logs.map((l) => l.adminId))];
  const admins = adminIds.length
    ? await prisma.user.findMany({
        where:  { id: { in: adminIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(admins.map((a) => [a.id, a.email]));

  return NextResponse.json({
    logs: logs.map((l) => ({
      ...l,
      // A deleted admin still has history worth reading — don't drop the row.
      adminEmail: emailById.get(l.adminId) ?? "(deleted account)",
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
