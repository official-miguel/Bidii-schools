import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ── Shared helper: fetch elective groups for a form (including school-wide) ──

async function fetchElectiveGroups(schoolId: string, formNum: number) {
  try {
    return await prisma.electiveGroup.findMany({
      where: {
        schoolId,
        OR: [{ scopeForm: 0 }, { scopeForm: formNum }],
      },
      include: {
        members: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
          },
          orderBy: { subject: { name: "asc" } },
        },
        teachers: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
          },
          orderBy: [
            { subject: { name: "asc" } },
            { teacher: { fullName: "asc" } },
          ],
        },
      },
      orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
    });
  } catch {
    // ElectiveGroupTeacher table not yet migrated — degrade gracefully
    return [];
  }
}

/**
 * GET /api/class-profiles/form/[form]
 *
 * Returns every subject that applies to the given form number, together with
 * the effective type (CORE / ELECTIVE) that applies to ALL classes in this
 * form.  Where different classes in the same form have diverging overrides the
 * response flags that with `mixed: true` so the UI can show a visual hint.
 *
 * Also returns all elective groups that apply to this form (scopeForm === form
 * OR scopeForm === 0), with their members and teacher pairings. The class
 * profile page uses this to render elective groups as a read-through view of
 * what the timetable requirements already define.
 *
 * Response shape:
 * {
 *   form: number,
 *   classes: [{ id, name, stream, frameworkType, _count: { students } }],
 *   subjects: [
 *     {
 *       id, name, code,
 *       department: { id, name },
 *       globalType: "CORE" | "ELECTIVE",
 *       effectiveType: "CORE" | "ELECTIVE",   // consensus or majority
 *       mixed: boolean,                         // true when classes disagree
 *       classOverrides: { [classId]: "CORE" | "ELECTIVE" }
 *     }
 *   ],
 *   electiveGroups: [
 *     {
 *       id, name, scopeForm, scopeStreams, lessonsPerWeek,
 *       members: [{ subjectId, subject: { id, code, name } }],
 *       teachers: [{ id, subjectId, teacherId, subject: {...}, teacher: {...} }]
 *     }
 *   ]
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { form: string } }
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formNum = parseInt(params.form, 10);
  if (isNaN(formNum) || formNum < 1) {
    return NextResponse.json({ error: "Invalid form number." }, { status: 400 });
  }

  // All classes in this form
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId!, form: formNum },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stream: true,
      frameworkType: true,
      _count: { select: { students: true } },
    },
  });

  if (classes.length === 0) {
    return NextResponse.json({ error: "No classes found for this form." }, { status: 404 });
  }

  const classIds = classes.map((c) => c.id);

  // All subjects that apply to this form number
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      applicableForms: { has: formNum },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      department: { select: { id: true, name: true } },
    },
  });

  // All per-class overrides for classes in this form
  const overrides = await prisma.classSubjectProfile.findMany({
    where: {
      classId: { in: classIds },
      schoolId: user.schoolId!,
    },
    select: { classId: true, subjectId: true, type: true },
  });

  // Build a map: subjectId → { classId → type }
  const overrideMap = new Map<string, Record<string, "CORE" | "ELECTIVE">>();
  for (const o of overrides) {
    if (!overrideMap.has(o.subjectId)) overrideMap.set(o.subjectId, {});
    overrideMap.get(o.subjectId)![o.classId] = o.type as "CORE" | "ELECTIVE";
  }

  const subjectsWithEffective = subjects.map((s) => {
    const classOverrides = overrideMap.get(s.id) ?? {};

    // Resolve the effective type per class, then look for consensus
    const effectivePerClass = classes.map((c) =>
      classOverrides[c.id] ?? (s.type as "CORE" | "ELECTIVE")
    );

    const allSame = effectivePerClass.every((t) => t === effectivePerClass[0]);
    const effectiveType: "CORE" | "ELECTIVE" = allSame
      ? effectivePerClass[0]
      : // If mixed, show majority; tie goes to the global type
        effectivePerClass.filter((t) => t === "CORE").length >= classes.length / 2
        ? "CORE"
        : "ELECTIVE";

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      globalType: s.type as "CORE" | "ELECTIVE",
      effectiveType,
      mixed: !allSame,
      classOverrides,
      department: s.department,
    };
  });

  return NextResponse.json({
    form: formNum,
    classes,
    subjects: subjectsWithEffective,
    electiveGroups: await fetchElectiveGroups(user.schoolId!, formNum),
  });
}

const putSchema = z.object({
  /**
   * Array of form-level subject type assignments.
   * Each entry is applied to EVERY class in this form, replacing any existing
   * per-class overrides for that subject.
   *
   * Subjects not in the list are left untouched.
   */
  assignments: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        type: z.enum(["CORE", "ELECTIVE"]),
      })
    )
    .min(1, "At least one assignment is required."),
});

/**
 * PUT /api/class-profiles/form/[form]
 *
 * Applies a subject-type assignment to EVERY class in the specified form.
 * This is the "set for whole form" action from the Class Profiles form page.
 *
 * For each (class, subject) pair in the form, this upserts a
 * ClassSubjectProfile row setting the requested type, overriding both the
 * global subject type and any previous per-class override.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { form: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formNum = parseInt(params.form, 10);
  if (isNaN(formNum) || formNum < 1) {
    return NextResponse.json({ error: "Invalid form number." }, { status: 400 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  // Fetch all classes in this form
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId!, form: formNum },
    select: { id: true },
  });
  if (classes.length === 0) {
    return NextResponse.json({ error: "No classes found for this form." }, { status: 404 });
  }

  // Verify all subjects belong to this school and apply to this form
  const subjectIds = parsed.data.assignments.map((a) => a.subjectId);
  const validSubjects = await prisma.subject.findMany({
    where: {
      id: { in: subjectIds },
      schoolId: user.schoolId!,
      applicableForms: { has: formNum },
    },
    select: { id: true },
  });
  const validIds = new Set(validSubjects.map((s) => s.id));
  const invalid = subjectIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "Some subjects do not apply to this form." },
      { status: 400 }
    );
  }

  // Upsert for every (class, subject) combination
  const upsertOps = classes.flatMap((cls) =>
    parsed.data.assignments.map((a) =>
      prisma.classSubjectProfile.upsert({
        where: {
          classId_subjectId: { classId: cls.id, subjectId: a.subjectId },
        },
        create: {
          classId: cls.id,
          subjectId: a.subjectId,
          schoolId: user.schoolId!,
          type: a.type,
        },
        update: { type: a.type },
      })
    )
  );

  try {
    await prisma.$transaction(upsertOps);
    return NextResponse.json({ ok: true, updated: upsertOps.length });
  } catch (e) {
    console.error("[class-profiles/form PUT]", e);
    return NextResponse.json({ error: "Couldn't save assignments." }, { status: 500 });
  }
}
