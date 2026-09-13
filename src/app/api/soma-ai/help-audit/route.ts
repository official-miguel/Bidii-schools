/**
 * GET /api/soma-ai/help-audit
 *
 * Returns Soma AI audit log rows where:
 *   - action = "SOMA_AI_QUERY"
 *   - detail.intent = "help"
 *   - detail.helpOutcome = "no_match"  (i.e. fell through to Gemini with no confident guide)
 *
 * Accessible by PRINCIPAL and ADMIN_STAFF so Miguel / school admins can see
 * which real questions aren't covered by help-content.ts yet.
 *
 * Query params:
 *   limit  — max rows (default 50, max 200)
 *   cursor — performedAt ISO timestamp for cursor-based pagination
 *   outcome — filter by helpOutcome: "no_match" | "disambiguation" | "confident" | "all"
 *             defaults to "no_match" (the most actionable view)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL", "ADMIN_STAFF");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const limit   = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const cursor  = sp.get("cursor") ?? null;
  const outcome = sp.get("outcome") ?? "no_match";

  // We filter inside the JSON detail column.  AuditLog has an index on
  // (schoolId, action) so the school + action filter is fast; the JSON
  // filter runs on that already-small result set.
  const raw = await prisma.auditLog.findMany({
    where: {
      schoolId: user.schoolId!,
      action: "SOMA_AI_QUERY",
      ...(cursor ? { performedAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { performedAt: "desc" },
    // Fetch more than needed so we can filter by detail.intent in JS
    // without a raw SQL JSON query (keeps the code portable across DB engines).
    take: limit * 4,
    select: {
      id:          true,
      performedAt: true,
      performedById: true,
      detail:      true,
    },
  });

  type DetailShape = {
    intent?: string;
    helpOutcome?: string;
    helpEntryId?: string;
    messageSample?: string;
    userRole?: string;
    executionMs?: number;
  };

  const filtered = raw
    .filter((row) => {
      const d = row.detail as DetailShape;
      if (d.intent !== "help") return false;
      if (outcome === "all") return true;
      return d.helpOutcome === outcome;
    })
    .slice(0, limit)
    .map((row) => {
      const d = row.detail as DetailShape;
      return {
        id:           row.id,
        performedAt:  row.performedAt,
        userRole:     d.userRole ?? null,
        messageSample: d.messageSample ?? null,
        helpOutcome:  d.helpOutcome ?? null,
        helpEntryId:  d.helpEntryId ?? null,
        executionMs:  d.executionMs ?? null,
      };
    });

  const nextCursor =
    filtered.length === limit
      ? filtered[filtered.length - 1]?.performedAt?.toISOString() ?? null
      : null;

  return NextResponse.json({
    rows: filtered,
    count: filtered.length,
    nextCursor,
    filter: { outcome },
  });
}
