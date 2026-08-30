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

    // Auto-populate requirements based on existing ClassSubjectTeacher assignments.
    //
    // Only class–subject pairs that already have a teacher attached are
    // considered.  For each class the available weekly lesson slots are
    // distributed evenly across those teacher-assigned subjects so their
    // combined lessonsPerWeek EXACTLY equals the timetable slot count.
    //
    // Elective groups are accounted for first: any group that scopes a class
    // already occupies `lessonsPerWeek` slots per week in the timetable.  Those
    // slots are subtracted from the class total before individual subjects are
    // distributed — ensuring groups + individual subjects always add up to the
    // full weekly capacity.
    //
    // Existing rows are UPSERTED — their lessonsPerWeek is always recalculated
    // so the total stays in sync with the template whenever teachers, groups,
    // or the template change.  Subjects without a teacher are never touched.
    if (action === "auto-populate") {
      // Fetch the school's timetable template to know how many lesson slots
      // are actually available each week (lesson columns × operating days).
      const [timetableConfig, electiveGroups, allClasses] = await Promise.all([
        prisma.timetableConfig.findUnique({
          where: { schoolId },
          select: {
            operatingDays: true,
            columns: {
              where: { slotType: "LESSON" },
              select: { id: true },
            },
          },
        }),
        // Elective groups — needed to know how many slots they already occupy
        // per class so we don't double-count those periods.
        prisma.electiveGroup.findMany({
          where: { schoolId },
          select: {
            id: true,
            scopeForm: true,
            scopeStreams: true,
            lessonsPerWeek: true,
          },
        }),
        // All classes — needed to resolve which groups scope each class.
        prisma.schoolClass.findMany({
          where: { schoolId },
          select: { id: true, form: true, stream: true },
        }),
      ]);

      // Total lesson slots available per class per week.
      // Falls back to the old heuristic (5 days × 8 periods = 40) only when
      // no template has been configured yet.
      const lessonPeriodsPerDay = timetableConfig?.columns.length ?? 8;
      const activeDays = timetableConfig?.operatingDays.length ?? 5;
      const totalWeeklySlots = lessonPeriodsPerDay * activeDays;

      // Build a lookup: classId → total group slots already committed.
      // A group scopes a class when:
      //   • scopeForm === 0 (school-wide), OR
      //   • scopeForm === class.form AND (scopeStreams is empty OR includes class.stream)
      const groupSlotsPerClass = new Map<string, number>(); // classId → slots consumed by groups
      for (const cls of allClasses) {
        let consumed = 0;
        for (const group of electiveGroups) {
          const matchesForm =
            group.scopeForm === 0 ||
            (group.scopeForm === cls.form &&
              (group.scopeStreams.length === 0 ||
                group.scopeStreams.includes(cls.stream ?? "")));
          if (matchesForm) {
            consumed += group.lessonsPerWeek;
          }
        }
        groupSlotsPerClass.set(cls.id, consumed);
      }

      // Fetch every ClassSubjectTeacher row for this school so we know which
      // (class, subject) pairs actually have a teacher assigned.
      const teacherAssignments = await prisma.classSubjectTeacher.findMany({
        where: { schoolClass: { schoolId } },
        select: { classId: true, subjectId: true },
      });

      // Group assignments by class so we can iterate per-class.
      const assignmentsByClass = new Map<string, string[]>(); // classId → subjectIds
      for (const a of teacherAssignments) {
        if (!assignmentsByClass.has(a.classId)) {
          assignmentsByClass.set(a.classId, []);
        }
        assignmentsByClass.get(a.classId)!.push(a.subjectId);
      }

      // Fetch subject metadata (doubleLesson flag) for all subjects in scope.
      const subjectMeta = await prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, doubleLesson: true },
      });
      const subjectMetaMap = new Map(subjectMeta.map((s) => [s.id, s]));

      // Build upsert payloads — one per teacher-assigned (class, subject) pair.
      type ReqRow = { schoolId: string; classId: string; subjectId: string; lessonsPerWeek: number };
      const requirements: ReqRow[] = [];

      for (const [classId, subjectIds] of assignmentsByClass) {
        if (subjectIds.length === 0) continue;

        // Slots already consumed by elective groups that scope this class.
        const groupsConsumed = groupSlotsPerClass.get(classId) ?? 0;

        // Remaining slots available for individually-scheduled subjects.
        const availableSlots = Math.max(0, totalWeeklySlots - groupsConsumed);

        // Build the list of subjects that have a teacher for this class.
        const assignedSubjects = subjectIds
          .map((id) => subjectMetaMap.get(id))
          .filter((s): s is NonNullable<typeof s> => s != null);

        // Distribute the remaining weekly slots evenly across teacher-assigned
        // subjects. Double-lesson subjects count as 2 "units" so they receive
        // twice as many slots as single-lesson subjects.
        const totalUnits = assignedSubjects.reduce(
          (sum, s) => sum + (s.doubleLesson ? 2 : 1),
          0
        );

        // Slots per single-lesson unit (floor, so we don't overshoot capacity)
        const slotsPerUnit = totalUnits > 0 ? Math.floor(availableSlots / totalUnits) : 0;

        // Distribute any integer remainder one slot at a time so the per-class
        // individual total exactly fills the remaining available slots.
        let remainder = availableSlots - slotsPerUnit * totalUnits;

        for (const subject of assignedSubjects) {
          const units = subject.doubleLesson ? 2 : 1;
          let lessons = slotsPerUnit * units;

          // Award one extra slot to this subject until the remainder runs out
          if (remainder > 0) {
            lessons += 1;
            remainder -= 1;
          }

          requirements.push({
            schoolId,
            classId,
            subjectId: subject.id,
            lessonsPerWeek: Math.max(1, lessons),
          });
        }
      }

      // Upsert every row so the lessonsPerWeek always reflects the current
      // template slot count — even for pairs that already existed.
      let upsertedCount = 0;
      await prisma.$transaction(
        requirements.map((r) => {
          upsertedCount++;
          return prisma.subjectLessonRequirement.upsert({
            where: { subjectId_classId: { subjectId: r.subjectId, classId: r.classId } },
            update: { lessonsPerWeek: r.lessonsPerWeek },
            create: r,
          });
        })
      );

      return NextResponse.json({
        success: true,
        created: upsertedCount,
        totalWeeklySlots,
        message: `Auto-populated ${upsertedCount} lesson requirements for teacher-assigned subjects (${totalWeeklySlots} slots/week across ${lessonPeriodsPerDay} periods × ${activeDays} days, elective group periods deducted per class)`,
      });
    }

    // ── sync-framework ──────────────────────────────────────────────────────
    // Ensures every class receives requirement rows for all subjects that
    // already have a teacher assigned (ClassSubjectTeacher).  Only NEW
    // (classId, subjectId) pairs are inserted; existing requirements are never
    // modified or deleted.
    //
    // Like auto-populate, elective group periods are deducted from each class's
    // available slots before distributing among individual subjects — so new
    // rows are seeded with counts that reflect the real remaining capacity.
    //
    // Subjects without a teacher are NOT added — they cannot be scheduled
    // until a teacher is assigned, so pre-seeding them just creates noise.
    if (action === "sync-framework") {
      const [timetableConfig, electiveGroups, allClasses] = await Promise.all([
        prisma.timetableConfig.findUnique({
          where: { schoolId },
          select: {
            operatingDays: true,
            columns: {
              where: { slotType: "LESSON" },
              select: { id: true },
            },
          },
        }),
        prisma.electiveGroup.findMany({
          where: { schoolId },
          select: {
            id: true,
            scopeForm: true,
            scopeStreams: true,
            lessonsPerWeek: true,
          },
        }),
        prisma.schoolClass.findMany({
          where: { schoolId },
          select: { id: true, form: true, stream: true },
        }),
      ]);

      const lessonPeriodsPerDay = timetableConfig?.columns.length ?? 8;
      const activeDays = timetableConfig?.operatingDays.length ?? 5;
      const totalWeeklySlots = lessonPeriodsPerDay * activeDays;

      // Build per-class group slot consumption map (same logic as auto-populate).
      const groupSlotsPerClass = new Map<string, number>();
      for (const cls of allClasses) {
        let consumed = 0;
        for (const group of electiveGroups) {
          const matchesForm =
            group.scopeForm === 0 ||
            (group.scopeForm === cls.form &&
              (group.scopeStreams.length === 0 ||
                group.scopeStreams.includes(cls.stream ?? "")));
          if (matchesForm) {
            consumed += group.lessonsPerWeek;
          }
        }
        groupSlotsPerClass.set(cls.id, consumed);
      }

      // Only consider (class, subject) pairs that have a teacher assigned.
      const teacherAssignments = await prisma.classSubjectTeacher.findMany({
        where: { schoolClass: { schoolId } },
        select: { classId: true, subjectId: true },
      });

      // Group by class so we can distribute slots per class.
      const assignmentsByClass = new Map<string, string[]>();
      for (const a of teacherAssignments) {
        if (!assignmentsByClass.has(a.classId)) {
          assignmentsByClass.set(a.classId, []);
        }
        assignmentsByClass.get(a.classId)!.push(a.subjectId);
      }

      // Fetch subject metadata (doubleLesson flag).
      const subjectMeta = await prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, doubleLesson: true },
      });
      const subjectMetaMap = new Map(subjectMeta.map((s) => [s.id, s]));

      // Load existing requirements so we only insert missing pairs.
      const existingReqs = await prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        select: { classId: true, subjectId: true },
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

      for (const [classId, subjectIds] of assignmentsByClass) {
        if (subjectIds.length === 0) continue;

        // Deduct group slots so new rows are seeded with the real remaining capacity.
        const groupsConsumed = groupSlotsPerClass.get(classId) ?? 0;
        const availableSlots = Math.max(0, totalWeeklySlots - groupsConsumed);

        const assignedSubjects = subjectIds
          .map((id) => subjectMetaMap.get(id))
          .filter((s): s is NonNullable<typeof s> => s != null);

        const totalUnits = assignedSubjects.reduce(
          (sum, s) => sum + (s.doubleLesson ? 2 : 1),
          0
        );
        const slotsPerUnit = totalUnits > 0 ? Math.floor(availableSlots / totalUnits) : 0;
        let remainder = availableSlots - slotsPerUnit * totalUnits;

        for (const subject of assignedSubjects) {
          const key = `${classId}:${subject.id}`;
          if (existingKeys.has(key)) continue; // already configured — leave it

          const units = subject.doubleLesson ? 2 : 1;
          let lessons = slotsPerUnit * units;
          if (remainder > 0) {
            lessons += 1;
            remainder -= 1;
          }

          toInsert.push({
            schoolId,
            classId,
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
          `Synced teacher-assigned subjects: added ${created.count} missing requirement${created.count !== 1 ? "s" : ""} ` +
          `(existing requirements were not modified, elective group periods deducted per class)`,
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
