import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";

type Ctx = { params: { id: string } };

const schema = z.object({
  name:         z.string().trim().min(1, "Provide a name for the cloned version.").max(80),
  description:  z.string().trim().max(300).optional(),
  academicYear: z.string().trim().max(10).optional(),
  term:         z.number().int().min(1).max(4).nullable().optional(),
});

// ── POST /api/timetable/v2/versions/[id]/clone ────────────────────────────
// Creates a new DRAFT version that is an exact slot-for-slot copy of the
// source version. Useful for cloning between terms or academic years.

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  // Verify source exists and belongs to this school
  const sourceRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, "schoolId" FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId}
  `;
  if (!sourceRows[0]) return NextResponse.json({ error: "Source version not found." }, { status: 404 });

  const newId = randomUUID();
  const now   = new Date();

  // Insert the new version header
  await prisma.$executeRaw`
    INSERT INTO "TimetableVersion"
      (id, "schoolId", name, description, status, "academicYear", term,
       "clonedFromId", "createdById", "createdAt", "updatedAt")
    VALUES (
      ${newId}, ${user.schoolId}, ${parsed.data.name},
      ${parsed.data.description ?? null},
      'DRAFT',
      ${parsed.data.academicYear ?? null},
      ${parsed.data.term ?? null},
      ${params.id},
      ${user.id}, ${now}, ${now}
    )
  `;

  // Copy all slots from source into the new version
  await prisma.$executeRaw`
    INSERT INTO "TimetableVersionSlot"
      (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
       "subjectId", "teacherId", room, "isManual", notes, "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text, ${newId}, "schoolId", "classId", "dayOfWeek", period,
      "subjectId", "teacherId", room, "isManual", notes, ${now}, ${now}
    FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id}
  `;

  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) FROM "TimetableVersionSlot" WHERE "versionId" = ${newId}
  `;

  // Audit
  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId}, ${newId},
      'CLONED'::"TimetableChangeAction",
      ${JSON.stringify({ sourceVersionId: params.id, name: parsed.data.name })}::jsonb,
      ${user.id}, ${now}
    )
  `;

  return NextResponse.json({
    id: newId,
    name: parsed.data.name,
    status: "DRAFT",
    slotCount: Number(countRows[0]?.count ?? 0),
  }, { status: 201 });
}
