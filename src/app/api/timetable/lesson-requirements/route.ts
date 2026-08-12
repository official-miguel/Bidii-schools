/**
 * API Route: /api/timetable/lesson-requirements
 * 
 * Manages per-class lesson requirements for subjects.
 * GET: Retrieve lesson requirements for a class or all classes
 * PUT: Update lesson requirements for a class
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { schoolId };
    if (classId) {
      where.classId = classId;
    }

    const requirements = await prisma.subjectLessonRequirement.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            internalCode: true,
            doubleLesson: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            form: true,
            stream: true,
          },
        },
      },
      orderBy: [{ classId: "asc" }, { subject: { code: "asc" } }],
    });

    return NextResponse.json({ requirements });
  } catch (error) {
    console.error("Error fetching lesson requirements:", error);
    return NextResponse.json(
      { error: "Failed to fetch lesson requirements" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;
    const body = await req.json();

    const { classId, requirements } = body;

    if (!classId || !Array.isArray(requirements)) {
      return NextResponse.json(
        { error: "classId and requirements array required" },
        { status: 400 }
      );
    }

    // Verify class belongs to school
    const classExists = await prisma.schoolClass.findFirst({
      where: { id: classId, schoolId },
    });

    if (!classExists) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Validate requirements
    for (const req of requirements) {
      if (!req.subjectId || typeof req.lessonsPerWeek !== "number") {
        return NextResponse.json(
          { error: "Each requirement must have subjectId and lessonsPerWeek" },
          { status: 400 }
        );
      }

      if (req.lessonsPerWeek < 0 || req.lessonsPerWeek > 20) {
        return NextResponse.json(
          {
            error: `Invalid lessonsPerWeek for subject ${req.subjectId}: must be 0-20`,
          },
          { status: 400 }
        );
      }
    }

    // Update requirements in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing requirements for this class
      await tx.subjectLessonRequirement.deleteMany({
        where: { classId },
      });

      // Create new requirements
      await tx.subjectLessonRequirement.createMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: requirements.map((req: any) => ({
          schoolId,
          classId,
          subjectId: req.subjectId,
          lessonsPerWeek: req.lessonsPerWeek,
        })),
      });

      // Fetch created requirements with relations
      const updated = await tx.subjectLessonRequirement.findMany({
        where: { classId },
        include: {
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
              internalCode: true,
              doubleLesson: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
              form: true,
              stream: true,
            },
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      requirements: result,
    });
  } catch (error) {
    console.error("Error updating lesson requirements:", error);
    return NextResponse.json(
      { error: "Failed to update lesson requirements" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;
    const body = await req.json();
    const { action } = body;

    // Auto-populate requirements based on subject applicableForms
    if (action === "auto-populate") {
      // Fetch the school's timetable template to know how many lesson slots
      // are actually available each week (lesson columns × operating days).
      const timetableConfig = await prisma.timetableConfig.findUnique({
        where: { schoolId },
        select: {
          operatingDays: true,
          columns: {
            where: { slotType: "LESSON" },
            select: { id: true },
          },
        },
      });

      // Total lesson slots available per class per week.
      // Falls back to the old heuristic (5 days × 8 periods = 40) only when
      // no template has been configured yet.
      const lessonPeriodsPerDay = timetableConfig?.columns.length ?? 8;
      const activeDays = timetableConfig?.operatingDays.length ?? 5;
      const totalWeeklySlots = lessonPeriodsPerDay * activeDays;

      const classes = await prisma.schoolClass.findMany({
        where: { schoolId },
        select: { id: true, form: true },
      });

      const subjects = await prisma.subject.findMany({
        where: { schoolId },
        select: {
          id: true,
          applicableForms: true,
          doubleLesson: true,
        },
      });

      const requirements = [];

      for (const cls of classes) {
        // Find subjects applicable to this form
        const applicableSubjects = subjects.filter((s) =>
          s.applicableForms.includes(cls.form)
        );

        if (applicableSubjects.length === 0) continue;

        // Distribute the available weekly slots evenly across subjects.
        // Double-lesson subjects count as 2 "units" so they receive twice as
        // many slots as single-lesson subjects in the same proportional split.
        const totalUnits = applicableSubjects.reduce(
          (sum, s) => sum + (s.doubleLesson ? 2 : 1),
          0
        );

        // Slots per single-lesson unit (floor, so we don't overshoot capacity)
        const slotsPerUnit = Math.floor(totalWeeklySlots / totalUnits);

        // Distribute any remainder to avoid leaving slots unused
        let remainder = totalWeeklySlots - slotsPerUnit * totalUnits;

        for (const subject of applicableSubjects) {
          const units = subject.doubleLesson ? 2 : 1;
          let lessons = slotsPerUnit * units;

          // Award one extra slot to this subject until the remainder runs out
          if (remainder > 0) {
            lessons += 1;
            remainder -= 1;
          }

          requirements.push({
            schoolId,
            classId: cls.id,
            subjectId: subject.id,
            lessonsPerWeek: Math.max(1, lessons),
          });
        }
      }

      // Create requirements (skip existing)
      const created = await prisma.subjectLessonRequirement.createMany({
        data: requirements,
        skipDuplicates: true,
      });

      return NextResponse.json({
        success: true,
        created: created.count,
        totalWeeklySlots,
        message: `Auto-populated ${created.count} lesson requirements (${totalWeeklySlots} slots/week across ${lessonPeriodsPerDay} periods × ${activeDays} days)`,
      });
    }

    // ── sync-framework ──────────────────────────────────────────────────────
    // Ensures every class receives ALL subjects that are applicable to its
    // form (framework).  Only NEW (classId, subjectId) pairs are inserted;
    // existing requirements are never modified or deleted.
    //
    // When a subject has a teacher, it will appear in the timetable.
    // When a subject has NO teacher it is still stored here but the generate
    // and pre-check routes silently skip it before handing work to the solver.
    if (action === "sync-framework") {
      const timetableConfig = await prisma.timetableConfig.findUnique({
        where: { schoolId },
        select: {
          operatingDays: true,
          columns: {
            where: { slotType: "LESSON" },
            select: { id: true },
          },
        },
      });

      const lessonPeriodsPerDay = timetableConfig?.columns.length ?? 8;
      const activeDays = timetableConfig?.operatingDays.length ?? 5;
      const totalWeeklySlots = lessonPeriodsPerDay * activeDays;

      const classes = await prisma.schoolClass.findMany({
        where: { schoolId },
        select: { id: true, form: true },
      });

      const subjects = await prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, applicableForms: true, doubleLesson: true },
      });

      // Load existing requirements so we can skip pairs that already exist.
      const existingReqs = await prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        select: { classId: true, subjectId: true, lessonsPerWeek: true },
      });
      const existingKeys = new Set(
        existingReqs.map((r) => `${r.classId}:${r.subjectId}`)
      );

      const toInsert: {
        schoolId: string;
        classId: string;
        subjectId: string;
        lessonsPerWeek: number;
      }[] = [];

      for (const cls of classes) {
        const applicable = subjects.filter((s) =>
          s.applicableForms.includes(cls.form)
        );
        if (applicable.length === 0) continue;

        const totalUnits = applicable.reduce(
          (sum, s) => sum + (s.doubleLesson ? 2 : 1),
          0
        );
        const slotsPerUnit = Math.floor(totalWeeklySlots / totalUnits);
        let remainder = totalWeeklySlots - slotsPerUnit * totalUnits;

        for (const subject of applicable) {
          const key = `${cls.id}:${subject.id}`;
          if (existingKeys.has(key)) continue; // already configured — leave it

          const units = subject.doubleLesson ? 2 : 1;
          let lessons = slotsPerUnit * units;
          if (remainder > 0) {
            lessons += 1;
            remainder -= 1;
          }

          toInsert.push({
            schoolId,
            classId: cls.id,
            subjectId: subject.id,
            lessonsPerWeek: Math.max(1, lessons),
          });
        }
      }

      const created = await prisma.subjectLessonRequirement.createMany({
        data: toInsert,
        skipDuplicates: true,
      });

      return NextResponse.json({
        success: true,
        created: created.count,
        totalWeeklySlots,
        message:
          `Synced framework subjects: added ${created.count} missing requirement${created.count !== 1 ? "s" : ""} ` +
          `(existing requirements were not modified)`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in lesson requirements POST:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
