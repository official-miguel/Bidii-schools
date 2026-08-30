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

  let body: unknown;
  try { body = await req.json(); } catch { body = null; }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const id  = randomUUID();
  const now = new Date();

  try {
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
  } catch (err) {
    console.error("[POST /api/timetable/v2/versions] INSERT failed:", err);
    return NextResponse.json({ error: "Failed to create timetable version." }, { status: 500 });
  }

  // Best-effort changelog — don't fail the whole request if this errors
  try {
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
  } catch {
    // changelog failure is non-fatal
  }

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "TimetableVersion" WHERE id = ${id}
  `;

  if (!rows[0]) {
    // Fallback: return a minimal object so the client can proceed
    return NextResponse.json(
      { id, name: parsed.data.name, status: "DRAFT", slotCount: 0,
        academicYear: parsed.data.academicYear ?? null, term: parsed.data.term ?? null },
      { status: 201 }
    );
  }

  return NextResponse.json(rows[0], { status: 201 });
}
