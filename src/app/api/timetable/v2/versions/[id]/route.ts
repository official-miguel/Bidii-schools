import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";

type Ctx = { params: { id: string } };

async function getVersion(versionId: string, schoolId: string) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "TimetableVersion" WHERE id = ${versionId} AND "schoolId" = ${schoolId}
  `;
  return rows[0] ?? null;
}

// ── GET /api/timetable/v2/versions/[id] ────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await getVersion(params.id, user.schoolId!);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  return NextResponse.json(version);
}

// ── PATCH /api/timetable/v2/versions/[id] ─────────────────────────────────
// Updates name / description / academicYear / term of a DRAFT version.

const patchSchema = z.object({
  name:         z.string().trim().min(1).max(80).optional(),
  description:  z.string().trim().max(300).nullable().optional(),
  academicYear: z.string().trim().max(10).nullable().optional(),
  term:         z.number().int().min(1).max(4).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await getVersion(params.id, user.schoolId!);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Archived versions cannot be edited." }, { status: 409 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const now = new Date();
  const d   = parsed.data;

  await prisma.$executeRaw`
    UPDATE "TimetableVersion"
    SET
      name          = COALESCE(${d.name ?? null}, name),
      description   = CASE WHEN ${d.description !== undefined} THEN ${d.description ?? null} ELSE description END,
      "academicYear"= CASE WHEN ${d.academicYear !== undefined} THEN ${d.academicYear ?? null} ELSE "academicYear" END,
      term          = CASE WHEN ${d.term !== undefined} THEN ${d.term ?? null} ELSE term END,
      "updatedAt"   = ${now}
    WHERE id = ${params.id}
  `;

  const updated = await getVersion(params.id, user.schoolId!);
  return NextResponse.json(updated);
}

// ── DELETE /api/timetable/v2/versions/[id] ────────────────────────────────
// Deletes a DRAFT or ARCHIVED version (PUBLISHED cannot be deleted directly).

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await getVersion(params.id, user.schoolId!);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "PUBLISHED")
    return NextResponse.json({ error: "Unpublish this version before deleting it." }, { status: 409 });

  try {
    // Slots cascade-delete via FK
    await prisma.$executeRaw`DELETE FROM "TimetableVersion" WHERE id = ${params.id}`;
  } catch (err) {
    console.error("[DELETE version] failed:", err);
    return NextResponse.json({ error: "Failed to delete timetable version." }, { status: 500 });
  }

  // Best-effort audit log
  try {
    await prisma.$executeRaw`
      INSERT INTO "TimetableChangeLog"
        (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
      VALUES (
        ${randomUUID()}, ${user.schoolId!}, ${params.id},
        'ARCHIVED'::"TimetableChangeAction",
        ${JSON.stringify({ deleted: true, name: version.name })}::jsonb,
        ${user.id}, ${new Date()}
      )
    `;
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
