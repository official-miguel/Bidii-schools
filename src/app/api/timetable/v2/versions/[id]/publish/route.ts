import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";

type Ctx = { params: { id: string } };

// ── POST /api/timetable/v2/versions/[id]/publish ──────────────────────────
// Publishes a DRAFT version. The previously published version (if any) is
// ARCHIVED. Slots from the published version are written into TimetableSlot
// so the legacy API routes and the offline store stay in sync.

export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId!}
  `;
  const version = rows[0];
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "PUBLISHED")
    return NextResponse.json({ error: "This version is already published." }, { status: 409 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Archived versions cannot be published." }, { status: 409 });

  // Count slots so we can reject empty publishes
  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) FROM "TimetableVersionSlot" WHERE "versionId" = ${params.id}
  `;
  const slotCount = Number(countRows[0]?.count ?? 0);
  if (slotCount === 0)
    return NextResponse.json({ error: "Add at least one lesson before publishing." }, { status: 422 });

  const now = new Date();

  // Archive whatever is currently published (there can only be one due to partial unique index)
  await prisma.$executeRaw`
    UPDATE "TimetableVersion"
    SET status = 'ARCHIVED', "updatedAt" = ${now}
    WHERE "schoolId" = ${user.schoolId!} AND status = 'PUBLISHED'
  `;

  // Publish the target version
  await prisma.$executeRaw`
    UPDATE "TimetableVersion"
    SET status = 'PUBLISHED', "publishedAt" = ${now},
        "publishedById" = ${user.id}, "updatedAt" = ${now}
    WHERE id = ${params.id}
  `;

  // ── Sync into legacy TimetableSlot table ────────────────────────────────
  // Full replace: delete all existing slots for this school then re-insert
  // from the version being published.  The DELETE means no existing row can
  // conflict, so ON CONFLICT DO NOTHING is a safe no-op guard.
  // The constraint is now (classId, teacherId, dayOfWeek, period) so a teacher
  // running a pooled session for two different classes at the same period
  // produces two distinct rows — one per class — without violating uniqueness.
  await prisma.$executeRaw`DELETE FROM "TimetableSlot" WHERE "schoolId" = ${user.schoolId!}`;

  await prisma.$executeRaw`
    INSERT INTO "TimetableSlot"
      (id, "classId", "dayOfWeek", period, "subjectId", "teacherId", room,
       "schoolId", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text, "classId", "dayOfWeek", period, "subjectId",
      "teacherId", room, ${user.schoolId!}, ${now}, ${now}
    FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id}
    ON CONFLICT DO NOTHING
  `;

  // Audit log
  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId!}, ${params.id},
      'PUBLISHED'::"TimetableChangeAction",
      ${JSON.stringify({ slotCount })}::jsonb,
      ${user.id}, ${now}
    )
  `;

  return NextResponse.json({ ok: true, slotCount });
}

// ── DELETE /api/timetable/v2/versions/[id]/publish (unpublish) ────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId!}
  `;
  const version = rows[0];
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status !== "PUBLISHED")
    return NextResponse.json({ error: "This version is not currently published." }, { status: 409 });

  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "TimetableVersion"
    SET status = 'DRAFT', "publishedAt" = NULL, "updatedAt" = ${now}
    WHERE id = ${params.id}
  `;

  return NextResponse.json({ ok: true });
}
