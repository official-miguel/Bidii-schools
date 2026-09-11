import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import {
  autoMatchLegacyForm,
  getStageByName,
} from "@/lib/curriculum/stageCatalog";
import type { FrameworkType } from "@prisma/client";

// ---------------------------------------------------------------------------
// GET /api/classes/stage-migration-review
//
// Returns every class whose stageName could not be automatically matched
// (i.e. stageName is null) so the Principal can assign the correct stage
// before promotion is configured. Includes an autoSuggestion field where
// the legacy form integer maps unambiguously to a catalog entry.
//
// Classes that already have a stageName are NOT returned — they are already
// resolved.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId, stageName: null },
    select: {
      id: true,
      name: true,
      form: true,
      frameworkType: true,
      stageName: true,
      stream: true,
      streamId: true,
    },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });

  const rows = classes.map((cls) => {
    const suggestion = autoMatchLegacyForm(cls.frameworkType as FrameworkType, cls.form);
    return {
      id:            cls.id,
      name:          cls.name,
      form:          cls.form,
      frameworkType: cls.frameworkType,
      stream:        cls.stream,
      streamId:      cls.streamId,
      /** Suggested stage from STAGE_CATALOG based on the legacy form integer.
       *  Null when the framework has no catalog or no match exists. */
      autoSuggestion: suggestion ?? null,
    };
  });

  return NextResponse.json({
    unresolvedCount: rows.length,
    classes:         rows,
  });
}

// ---------------------------------------------------------------------------
// POST /api/classes/stage-migration-review
//
// Assigns a stageName to one or more classes in bulk. Each entry in the
// `assignments` array is { classId, stageName }. The form integer is
// automatically set to the catalog rank.
// ---------------------------------------------------------------------------
const assignSchema = z.object({
  assignments: z
    .array(
      z.object({
        classId:   z.string(),
        stageName: z.string().trim().min(1),
      })
    )
    .min(1, "At least one assignment is required."),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = assignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const errors: { classId: string; error: string }[] = [];
  const updates: { classId: string; stageName: string; form: number }[] = [];

  // Validate every assignment against the catalog for that class's framework.
  const classIds = parsed.data.assignments.map((a) => a.classId);
  const dbClasses = await prisma.schoolClass.findMany({
    where: { id: { in: classIds }, schoolId: user.schoolId },
    select: { id: true, frameworkType: true },
  });
  const dbMap = new Map(dbClasses.map((c) => [c.id, c]));

  for (const { classId, stageName } of parsed.data.assignments) {
    const cls = dbMap.get(classId);
    if (!cls) {
      errors.push({ classId, error: "Class not found." });
      continue;
    }
    const entry = getStageByName(cls.frameworkType as FrameworkType, stageName);
    if (!entry) {
      errors.push({
        classId,
        error: `"${stageName}" is not a valid stage for ${cls.frameworkType}.`,
      });
      continue;
    }
    updates.push({ classId, stageName: entry.name, form: entry.rank });
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Some assignments are invalid.", details: errors }, { status: 400 });
  }

  // Apply all updates in a transaction.
  await prisma.$transaction(
    updates.map(({ classId, stageName, form }) =>
      prisma.schoolClass.update({
        where: { id: classId },
        data:  { stageName, form },
      })
    )
  );

  return NextResponse.json({ ok: true, updatedCount: updates.length });
}
