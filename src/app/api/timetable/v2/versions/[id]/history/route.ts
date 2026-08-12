import { NextRequest, NextResponse } from "next/server";
import { prisma }                   from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { requirePermission, requireSchoolPermission } from "@/lib/permissions";

type Ctx = { params: { id: string } };

/**
 * GET /api/timetable/v2/versions/[id]/history
 *
 * Returns the TimetableChangeLog for this version, newest first.
 * Query params:
 *   page   (default 1)
 *   limit  (default 50, max 200)
 *   source ("MANUAL" | "AI" | "SYSTEM") — filter by changeSource
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify version belongs to this school
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId!}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const search = req.nextUrl.searchParams;
  const page   = Math.max(1,   Number(search.get("page")  ?? "1"));
  const limit  = Math.min(200, Math.max(1, Number(search.get("limit") ?? "50")));
  const source = search.get("source");   // optional filter
  const offset = (page - 1) * limit;

  // Build source filter
  const sourceClause = source
    ? `AND l."changeSource" = '${source.replace(/'/g, "''")}'`
    : "";

  type LogRow = {
    id: string;
    action: string;
    changeSource: string | null;
    slotId: string | null;
    detail: Record<string, unknown>;
    beforeState: Record<string, unknown> | null;
    afterState:  Record<string, unknown> | null;
    reason: string | null;
    performedAt: Date;
    performedById: string | null;
    performerEmail: string | null;
    performerRole:  string | null;
  };

  const rows = await prisma.$queryRawUnsafe<LogRow[]>(`
    SELECT
      l.id,
      l.action,
      l."changeSource",
      l."slotId",
      l.detail,
      l."beforeState",
      l."afterState",
      l.reason,
      l."performedAt",
      l."performedById",
      u.email     AS "performerEmail",
      u.role      AS "performerRole"
    FROM "TimetableChangeLog" l
    LEFT JOIN "User" u ON u.id = l."performedById"
    WHERE l."versionId" = $1 ${sourceClause}
    ORDER BY l."performedAt" DESC
    LIMIT $2 OFFSET $3
  `, params.id, limit, offset);

  // Total count for pagination
  const countRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*) FROM "TimetableChangeLog"
    WHERE "versionId" = $1 ${sourceClause}
  `, params.id);

  const total = Number(countRows[0]?.count ?? 0);

  // Human-readable action labels
  const ACTION_LABELS: Record<string, string> = {
    CREATED:          "Version created",
    SLOT_ADDED:       "Lesson added",
    SLOT_REMOVED:     "Lesson removed",
    SLOT_MOVED:       "Lesson moved",
    PUBLISHED:        "Published",
    ARCHIVED:         "Archived",
    CLONED:           "Cloned",
    ROLLED_BACK:      "Rolled back",
    GENERATED:        "AI generated",
    LOCK:             "Lesson locked",
    UNLOCK:           "Lesson unlocked",
    REOPTIMIZED:      "AI re-optimized",
    OVERRIDE_APPLIED: "Override applied",
  };

  const formatted = rows.map((r) => ({
    id:           r.id,
    action:       r.action,
    actionLabel:  ACTION_LABELS[r.action] ?? r.action,
    changeSource: r.changeSource,
    slotId:       r.slotId,
    detail:       r.detail,
    beforeState:  r.beforeState,
    afterState:   r.afterState,
    reason:       r.reason,
    performedAt:  r.performedAt,
    performer: r.performedById ? {
      id:    r.performedById,
      email: r.performerEmail,
      role:  r.performerRole,
    } : null,
  }));

  return NextResponse.json({
    entries:  formatted,
    total,
    page,
    limit,
    pages:    Math.ceil(total / limit),
  });
}
