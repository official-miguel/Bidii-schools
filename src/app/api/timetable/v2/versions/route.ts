import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";

async function getUser() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
}

// ── GET /api/timetable/v2/versions ─────────────────────────────────────────
// Returns all versions for the school, newest first.

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versions = await prisma.$queryRaw<
    Array<{
      id: string; name: string; description: string | null;
      status: string; academicYear: string | null; term: number | null;
      slotCount: bigint; createdAt: Date; updatedAt: Date;
      publishedAt: Date | null; generatedAt: Date | null;
      clonedFromId: string | null;
      vulnerabilities: unknown | null;
    }>
  >`
    SELECT v.id, v.name, v.description, v.status,
           v."academicYear", v.term,
           COUNT(s.id) AS "slotCount",
           v."createdAt", v."updatedAt", v."publishedAt", v."generatedAt",
           v."clonedFromId", v."vulnerabilities"
    FROM "TimetableVersion" v
    LEFT JOIN "TimetableVersionSlot" s ON s."versionId" = v.id
    WHERE v."schoolId" = ${user.schoolId!}
    GROUP BY v.id
    ORDER BY v."createdAt" DESC
  `;

  return NextResponse.json(
    versions.map((v) => ({ ...v, slotCount: Number(v.slotCount) }))
  );
}

// ── POST /api/timetable/v2/versions ────────────────────────────────────────
// Creates a new empty DRAFT version.

const createSchema = z.object({
  name:         z.string().trim().min(1, "Name is required.").max(80),
  description:  z.string().trim().max(300).optional(),
  academicYear: z.string().trim().max(10).optional(),
  term:         z.number().int().min(1).max(4).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const id  = randomUUID();
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "TimetableVersion"
      (id, "schoolId", name, description, status, "academicYear", term,
       "createdById", "createdAt", "updatedAt")
    VALUES (
      ${id}, ${user.schoolId!}, ${parsed.data.name},
      ${parsed.data.description ?? null},
      'DRAFT',
      ${parsed.data.academicYear ?? null},
      ${parsed.data.term ?? null},
      ${user.id}, ${now}, ${now}
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId!}, ${id},
      'CREATED'::"TimetableChangeAction",
      ${JSON.stringify({ name: parsed.data.name })}::jsonb,
      ${user.id}, ${now}
    )
  `;

  const version = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "TimetableVersion" WHERE id = ${id}
  `;

  return NextResponse.json(version[0], { status: 201 });
}
