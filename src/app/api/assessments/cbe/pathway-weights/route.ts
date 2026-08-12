import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { DEFAULT_PATHWAY_WEIGHT } from "@/lib/assessment/gradingCbe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/cbe/pathway-weights?classId=…
 *
 * Returns all subjects applicable to the class's form, each with their
 * configured pathway weight (or the system defaults if none is set).
 */
export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "classId is required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId! },
    select: { id: true, form: true },
  });
  if (!schoolClass) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      applicableForms: { has: schoolClass.form },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  // Fetch all configured weights for the framework in one query.
  const weights: Array<{
    subjectId: string;
    sbaWeight: number;
    examWeight: number;
    sbaMaxMarks: number;
    examMaxMarks: number;
  }> = framework
    ? await db.pathwayWeight.findMany({
        where: { frameworkId: framework.id, schoolId: user.schoolId! },
        select: {
          subjectId:    true,
          sbaWeight:    true,
          examWeight:   true,
          sbaMaxMarks:  true,
          examMaxMarks: true,
        },
      })
    : [];

  const weightMap = new Map(weights.map((w) => [w.subjectId, w]));

  const result = subjects.map((s) => {
    const w = weightMap.get(s.id);
    return {
      subject:      s,
      sbaWeight:    w?.sbaWeight    ?? DEFAULT_PATHWAY_WEIGHT.sbaWeight,
      examWeight:   w?.examWeight   ?? DEFAULT_PATHWAY_WEIGHT.examWeight,
      sbaMaxMarks:  w?.sbaMaxMarks  ?? DEFAULT_PATHWAY_WEIGHT.sbaMaxMarks,
      examMaxMarks: w?.examMaxMarks ?? DEFAULT_PATHWAY_WEIGHT.examMaxMarks,
      isDefault:    !w,
    };
  });

  return NextResponse.json({ frameworkId: framework?.id ?? null, subjects: result });
}

/**
 * POST /api/assessments/cbe/pathway-weights
 *
 * Upsert one or more PathwayWeight rows. Principal-only.
 */
const upsertSchema = z.object({
  items: z.array(
    z.object({
      subjectId:    z.string().min(1),
      sbaWeight:    z.number().min(0).max(1),
      examWeight:   z.number().min(0).max(1),
      sbaMaxMarks:  z.number().positive(),
      examMaxMarks: z.number().positive(),
    })
  ).min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;
  if (!framework) {
    return NextResponse.json({ error: "No active CBE framework found." }, { status: 404 });
  }

  // Validate all subjectIds belong to this school.
  const subjectIds = parsed.data.items.map((i) => i.subjectId);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds }, schoolId: user.schoolId! },
    select: { id: true },
  });
  const validIds = new Set(subjects.map((s) => s.id));
  const invalid  = subjectIds.find((id) => !validIds.has(id));
  if (invalid) {
    return NextResponse.json({ error: `Subject ${invalid} not found.` }, { status: 400 });
  }

  // Validate weights sum to 1.0 per item.
  for (const item of parsed.data.items) {
    const sum = Math.round((item.sbaWeight + item.examWeight) * 1000) / 1000;
    if (sum !== 1) {
      return NextResponse.json(
        { error: `sbaWeight + examWeight must equal 1.0 (got ${sum}) for subject ${item.subjectId}.` },
        { status: 422 }
      );
    }
  }

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      db.pathwayWeight.upsert({
        where: { PathwayWeight_frameworkId_subjectId_key: { frameworkId: framework.id, subjectId: item.subjectId } },
        create: {
          schoolId: user.schoolId!,
          frameworkId:  framework.id,
          subjectId:    item.subjectId,
          sbaWeight:    item.sbaWeight,
          examWeight:   item.examWeight,
          sbaMaxMarks:  item.sbaMaxMarks,
          examMaxMarks: item.examMaxMarks,
        },
        update: {
          sbaWeight:    item.sbaWeight,
          examWeight:   item.examWeight,
          sbaMaxMarks:  item.sbaMaxMarks,
          examMaxMarks: item.examMaxMarks,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, count: parsed.data.items.length });
}
