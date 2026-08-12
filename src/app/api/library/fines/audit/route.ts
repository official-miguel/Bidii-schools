/**
 * GET /api/library/fines/audit
 * Returns the fine event audit log for a card or school-wide.
 * ?cardId=xxx    — filter to one card
 * ?take=100      — page size
 * ?cursor=xxx    — pagination cursor
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const cardId = sp.get("cardId") ?? undefined;
  const take   = Math.min(Number(sp.get("take") ?? "100"), 500);
  const cursor = sp.get("cursor") ?? undefined;

  const rows = await prisma.libraryFineAudit.findMany({
    where: { schoolId: user.schoolId, ...(cardId ? { cardId } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore    = rows.length > take;
  const data       = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return NextResponse.json({ items: data, nextCursor });
}
