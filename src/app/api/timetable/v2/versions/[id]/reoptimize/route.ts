/**
 * API Route: POST /api/timetable/v2/versions/[id]/reoptimize
 *
 * Re-generates unlocked slots for specified classes in an existing DRAFT version.
 * Locked slots are preserved as positional pins — the CP-SAT engine hard-fixes them.
 * Returns a diff preview; add ?apply=true to persist.
 *
 * Phase 1: migrated from deterministicEngine.generateTimetable to
 * generateWithValidation (CP-SAT path). Locked slots are passed as lockedSlots
 * in CpSatInput so the solver hard-fixes them via model.add(x == 1).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { generateWithValidation } from "@/lib/timetable/regenerationController";
import type { CpSatInput, LockedSlotPin } from "@/lib/timetable/cpSatEngine";
import type { TemplateColumn, EngineClass, EngineSubject } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

type Ctx = { params: { id: string } };

const schema = z.object({
  classIds: z.array(z.string()).optional(),
  reason: z.string().trim().max(300).optional(),
});

export type DiffStatus = "unchanged" | "changed" | "added" | "removed" | "locked";

export async function POST(req: NextRequest, { params }: Ctx) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;
  const apply = req.nextUrl.searchParams.get("apply") === "true";

  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { classIds: targetClassIds, reason } = body.data;

  // Verify version
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${schoolId}`;

  if (!vRows[0]) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (vRows[0].status === "ARCHIVED") {
    return NextResponse.json(
      { error: "Cannot re-generate an archived version" },
      { status: 409 }
    );
  }

  // Load current slots
  type RawSlot = {
    id: string;
    classId: string;
    className: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    teacherId: string;
    teacherName: string;
    room: string | null;
    isLocked: boolean;
  };

  const currentSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s.id, s."classId", c.name AS "className",
           s."dayOfWeek", s.period,
           s."subjectId", sub.code AS "subjectCode",
           s."teacherId", t."fullName" AS "teacherName",
           s.room, s."isLocked"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}
    ORDER BY s."classId", s."dayOfWeek", s.period`;

  const lockedSlots = currentSlots.filter((s) => s.isLocked);
  const unlockedSlots = currentSlots.filter((s) => !s.isLocked);

  // Determine which classes to re-generate
  const candidateClasses = targetClassIds?.length
    ? [...new Set(unlockedSlots.filter((s) => targetClassIds.includes(s.classId)).map((s) => s.classId))]
    : [...new Set(unlockedSlots.map((s) => s.classId))];

  if (candidateClasses.length === 0) {
    return NextResponse.json({ error: "No unlocked slots to re-generate" }, { status: 422 });
  }

  // Load engine data
  const [classesRaw, requirements, teacherAssignments, unavailRows, timetableConfig, sessionPrefs] =
    await Promise.all([
      prisma.schoolClass.findMany({
        where: { schoolId, id: { in: candidateClasses } },
        select: { id: true, name: true, form: true, stream: true },
        orderBy: [{ form: "asc" }, { name: "asc" }],
      }),
      prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        include: {
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
              internalCode: true,
              doubleLesson: true,
              requiresSpecialRoom: true,
            },
          },
        },
      }),
      prisma.classSubjectTeacher.findMany({
        where: { schoolClass: { schoolId } },
        select: { classId: true, subjectId: true, teacherId: true },
      }),
      prisma.teacherUnavailability.findMany({
        where: { teacher: { schoolId } },
        select: { teacherId: true, dayOfWeek: true, period: true },
      }),
      prisma.timetableConfig.findUnique({
        where: { schoolId },
        include: {
          columns: { orderBy: { position: "asc" } },
          preferences: true,
        },
      }),
      prisma.timetablePreference.findMany({
        where: { config: { schoolId } },
      }),
    ]);

  if (!timetableConfig) {
    return NextResponse.json({ error: "Timetable template not configured" }, { status: 400 });
  }

  const templateColumns = timetableConfig.columns as TemplateColumn[];

  // Build engine inputs
  const subjectMap = new Map<string, EngineSubject>();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, {
        id: req.subject.id,
        internalCode: req.subject.internalCode,
        code: req.subject.code,
        name: req.subject.name,
        doubleLesson: req.subject.doubleLesson,
        requiresSpecialRoom: req.subject.requiresSpecialRoom,
      });
    }
  }

  const formStreamCount = new Map<number, number>();
  const engineClasses: EngineClass[] = classesRaw.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return { id: cls.id, name: cls.name, form: cls.form, stream: cls.stream, streamIndex: count };
  });

  const regenSet = new Set(candidateClasses);

  // Build teacher unavailability:
  //   1. Explicit teacher unavailability rows
  //   2. Slots from other (non-regen) classes — treat as occupied
  const otherClassUnavailability = currentSlots
    .filter((s) => !regenSet.has(s.classId))
    .map((s) => ({ teacherId: s.teacherId, dayOfWeek: s.dayOfWeek, period: s.period }));

  const combinedUnavailability = [...unavailRows, ...otherClassUnavailability];

  // Build locked slots for CP-SAT (only locked slots belonging to regen classes)
  const solverLockedSlots: LockedSlotPin[] = lockedSlots
    .filter((s) => regenSet.has(s.classId))
    .map((s) => ({
      classId: s.classId,
      subjectId: s.subjectId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
    }));

  // Subtract already-locked lessons from requirements
  // so the solver doesn't double-count them
  const lockedCountMap = new Map<string, number>();
  for (const s of lockedSlots.filter((s) => regenSet.has(s.classId))) {
    const key = `${s.classId}-${s.subjectId}`;
    lockedCountMap.set(key, (lockedCountMap.get(key) ?? 0) + 1);
  }

  const engineRequirements = requirements
    .filter((r) => candidateClasses.includes(r.classId))
    .map((r) => {
      const locked = lockedCountMap.get(`${r.classId}-${r.subjectId}`) ?? 0;
      return {
        subjectId: r.subjectId,
        classId: r.classId,
        lessonsPerWeek: Math.max(0, r.lessonsPerWeek - locked),
      };
    })
    .filter((r) => r.lessonsPerWeek > 0);

  const engineSessionPrefs = sessionPrefs
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  const teacherIds = [...new Set(teacherAssignments.map((a) => a.teacherId))];
  const teachersRaw = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, fullName: true },
  });

  // Build CpSatInput
  const cpSatInput: CpSatInput = {
    subjects: Array.from(subjectMap.values()),
    classes: engineClasses,
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: engineRequirements,
    teacherAssignments,
    teacherUnavailability: combinedUnavailability,
    sessionPreferences: engineSessionPrefs,
    config: {
      academicYear: timetableConfig.academicYear ?? new Date().getFullYear().toString(),
      term: timetableConfig.term ?? 1,
      operatingDays: timetableConfig.operatingDays,
      maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
      templateColumns,
    },
    lockedSlots: solverLockedSlots,
    linkedClassGroups: [],
  };

  // Build validatorInput (excluding slots — those come from the result)
  const validatorInput = {
    classes: classesRaw.map((c) => ({ id: c.id, name: c.name, form: c.form })),
    subjects: Array.from(subjectMap.values()),
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: engineRequirements,
    teacherAssignments,
    teacherUnavailability: unavailRows,
    studentSelections: [],
    sessionPreferences: engineSessionPrefs,
    templateColumns,
    operatingDays: timetableConfig.operatingDays,
    linkedClassGroups: [],
  };

  // Call CP-SAT via generateWithValidation
  const regen = await generateWithValidation(cpSatInput, validatorInput);

  if (regen.aborted) {
    return NextResponse.json(
      {
        error: `Cannot generate timetable: solver unreachable`,
        hint: "Start the solver with: cd timetable-solver && python solver.py",
      },
      { status: 422 }
    );
  }

  const engineResult = regen.finalResult!;

  // Build diff
  const subjectCodeMap = new Map(Array.from(subjectMap.values()).map((s) => [s.id, s.code]));
  const classNameMap = new Map(classesRaw.map((c) => [c.id, c.name]));

  const currentMap = new Map(
    unlockedSlots
      .filter((s) => regenSet.has(s.classId))
      .map((s) => [`${s.classId}|${s.dayOfWeek}-${s.period}`, s])
  );
  const proposedMap = new Map(
    engineResult.slots.map((s) => [`${s.classId}|${s.dayOfWeek}-${s.period}`, s])
  );

  const allKeys = new Set([...currentMap.keys(), ...proposedMap.keys()]);
  const diff = [];

  for (const s of lockedSlots.filter((s) => regenSet.has(s.classId))) {
    diff.push({ status: "locked" as DiffStatus, current: s, proposed: null, changedFields: [] });
  }

  for (const key of allKeys) {
    const cur = currentMap.get(key) ?? null;
    const prop = proposedMap.get(key) ?? null;

    if (cur && !prop) {
      diff.push({ status: "removed" as DiffStatus, current: cur, proposed: null, changedFields: [] });
    } else if (!cur && prop) {
      diff.push({
        status: "added" as DiffStatus,
        current: null,
        proposed: {
          classId: prop.classId,
          className: classNameMap.get(prop.classId) ?? prop.classId,
          dayOfWeek: prop.dayOfWeek,
          period: prop.period,
          subjectId: prop.subjectId,
          subjectCode: subjectCodeMap.get(prop.subjectId) ?? prop.subjectId,
          teacherId: prop.teacherId,
          room: prop.room,
        },
        changedFields: [],
      });
    } else if (cur && prop) {
      const changed: string[] = [];
      if (cur.teacherId !== prop.teacherId) changed.push("teacher");
      if (cur.room !== prop.room) changed.push("room");
      diff.push({
        status: (changed.length ? "changed" : "unchanged") as DiffStatus,
        current: cur,
        proposed: changed.length ? { ...cur, teacherId: prop.teacherId, room: prop.room } : null,
        changedFields: changed,
      });
    }
  }

  const stats = {
    locked: diff.filter((d) => d.status === "locked").length,
    unchanged: diff.filter((d) => d.status === "unchanged").length,
    changed: diff.filter((d) => d.status === "changed").length,
    added: diff.filter((d) => d.status === "added").length,
    removed: diff.filter((d) => d.status === "removed").length,
    warnings: engineResult.warnings,
  };

  if (apply) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const cid of candidateClasses) {
        await tx.$executeRaw`
          DELETE FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" = ${cid} AND "isLocked" = false`;
      }

      for (const s of engineResult.slots) {
        await tx.$executeRaw`
          INSERT INTO "TimetableVersionSlot"
            (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
             "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${params.id}, ${schoolId}, ${s.classId},
                  ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
                  ${s.room ?? null}, false, ${now}, ${now})
          ON CONFLICT ("versionId", "classId", "teacherId", "dayOfWeek", period) DO NOTHING`;
      }

      await tx.$executeRaw`
        INSERT INTO "TimetableChangeLog"
          (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
        VALUES (${randomUUID()}, ${schoolId}, ${params.id},
                'REOPTIMIZED'::"TimetableChangeAction",
                ${JSON.stringify({ stats, classCount: candidateClasses.length, reason })}::jsonb,
                ${user.id}, ${now})`;
    });
  }

  return NextResponse.json({ diff, stats, applied: apply });
}
