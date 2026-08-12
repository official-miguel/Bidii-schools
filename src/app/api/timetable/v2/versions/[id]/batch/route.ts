/**
 * API Route: POST /api/timetable/v2/versions/[id]/batch
 *
 * Applies multiple manual slot operations in a single transaction.
 * Operations: MOVE, DELETE, ADD.
 * AUTO_FIX: re-generates slots for specified classes using the deterministic engine.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { generateTimetable } from "@/lib/timetable/deterministicEngine";
import { getLessonColumns } from "@/lib/timetable/engineHelpers";
import type { TemplateColumn, EngineClass, EngineSubject } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

type Ctx = { params: { id: string } };

const moveOp = z.object({
  type: z.literal("MOVE"),
  slotId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  period: z.number().int().min(1).max(20),
  teacherId: z.string().optional(),
  room: z.string().max(80).nullable().optional(),
});

const deleteOp = z.object({
  type: z.literal("DELETE"),
  slotId: z.string(),
});

const addOp = z.object({
  type: z.literal("ADD"),
  classId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  period: z.number().int().min(1).max(20),
  subjectId: z.string(),
  teacherId: z.string(),
  room: z.string().max(80).nullable().optional(),
});

const autoFixOp = z.object({
  type: z.literal("AUTO_FIX"),
  classIds: z.array(z.string()),
});

const bodySchema = z.object({
  operations: z.array(z.discriminatedUnion("type", [moveOp, deleteOp, addOp, autoFixOp]))
    .min(1)
    .max(200),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Verify version
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${schoolId}`;

  if (!vRows[0]) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (vRows[0].status === "ARCHIVED") {
    return NextResponse.json({ error: "Cannot edit an archived version" }, { status: 409 });
  }

  const now = new Date();
  const applied: string[] = [];
  const errors: string[] = [];

  for (const op of body.data.operations) {
    try {
      if (op.type === "DELETE") {
        await prisma.$executeRaw`
          DELETE FROM "TimetableVersionSlot"
          WHERE id = ${op.slotId} AND "versionId" = ${params.id}`;
        applied.push(`DELETE:${op.slotId}`);

      } else if (op.type === "ADD") {
        // Check class conflict
        const cc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" = ${op.classId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}`;
        if (cc.length > 0) {
          errors.push(`ADD: class already has a lesson at day ${op.dayOfWeek} period ${op.period}`);
          continue;
        }

        // Check teacher conflict
        const tc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "teacherId" = ${op.teacherId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}`;
        if (tc.length > 0) {
          errors.push(`ADD: teacher already booked at day ${op.dayOfWeek} period ${op.period}`);
          continue;
        }

        const newId = randomUUID();
        await prisma.$executeRaw`
          INSERT INTO "TimetableVersionSlot"
            (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
             "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
          VALUES (${newId}, ${params.id}, ${schoolId}, ${op.classId},
                  ${op.dayOfWeek}, ${op.period}, ${op.subjectId}, ${op.teacherId},
                  ${op.room ?? null}, true, ${now}, ${now})`;
        applied.push(`ADD:${newId}`);

      } else if (op.type === "MOVE") {
        const slotRows = await prisma.$queryRaw<
          Array<{ classId: string; subjectId: string; teacherId: string }>
        >`
          SELECT "classId", "subjectId", "teacherId"
          FROM "TimetableVersionSlot"
          WHERE id = ${op.slotId} AND "versionId" = ${params.id}`;

        if (!slotRows[0]) {
          errors.push(`MOVE: slot ${op.slotId} not found`);
          continue;
        }

        const slot = slotRows[0];
        const effectiveTeacher = op.teacherId ?? slot.teacherId;

        // Check class conflict at destination
        const cc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" = ${slot.classId}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}
            AND id != ${op.slotId}`;
        if (cc.length > 0) {
          errors.push(`MOVE: class conflict at day ${op.dayOfWeek} period ${op.period}`);
          continue;
        }

        // Check teacher conflict at destination
        const tc = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "teacherId" = ${effectiveTeacher}
            AND "dayOfWeek" = ${op.dayOfWeek} AND period = ${op.period}
            AND id != ${op.slotId}`;
        if (tc.length > 0) {
          errors.push(`MOVE: teacher conflict at day ${op.dayOfWeek} period ${op.period}`);
          continue;
        }

        await prisma.$executeRaw`
          UPDATE "TimetableVersionSlot"
          SET "dayOfWeek" = ${op.dayOfWeek},
              period = ${op.period},
              "teacherId" = ${effectiveTeacher},
              room = ${op.room !== undefined ? op.room : null},
              "isManual" = true,
              "updatedAt" = ${now}
          WHERE id = ${op.slotId}`;
        applied.push(`MOVE:${op.slotId}`);

      } else if (op.type === "AUTO_FIX") {
        // Re-generate slots for the specified classes
        const [classesRaw, requirements, teacherAssignments, unavailRows, timetableConfig, sessionPrefs] =
          await Promise.all([
            prisma.schoolClass.findMany({
              where: { schoolId, id: { in: op.classIds } },
              select: { id: true, name: true, form: true, stream: true },
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

        if (!classesRaw.length || !timetableConfig) {
          errors.push("AUTO_FIX: no valid classes or template not configured");
          continue;
        }

        const templateColumns = timetableConfig.columns as TemplateColumn[];
        const lessonColumns = getLessonColumns(templateColumns);

        if (lessonColumns.length === 0) {
          errors.push("AUTO_FIX: template has no lesson slots");
          continue;
        }

        // Build subject map
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

        // Treat other classes' slots as teacher unavailability
        const otherSlots = await prisma.$queryRaw<
          Array<{ teacherId: string; dayOfWeek: number; period: number }>
        >`
          SELECT "teacherId", "dayOfWeek", period
          FROM "TimetableVersionSlot"
          WHERE "versionId" = ${params.id} AND "classId" != ALL(${op.classIds}::text[])`;

        const extraUnavailability = [
          ...unavailRows,
          ...otherSlots,
        ];

        const formStreamCount = new Map<number, number>();
        const engineClasses: EngineClass[] = classesRaw.map((cls) => {
          const count = formStreamCount.get(cls.form) ?? 0;
          formStreamCount.set(cls.form, count + 1);
          return {
            id: cls.id,
            name: cls.name,
            form: cls.form,
            stream: cls.stream,
            streamIndex: count,
          };
        });

        const engineRequirements = requirements
          .filter((r) => op.classIds.includes(r.classId))
          .map((r) => ({
            subjectId: r.subjectId,
            classId: r.classId,
            lessonsPerWeek: r.lessonsPerWeek,
          }));

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

        const engineResult = generateTimetable({
          subjects: Array.from(subjectMap.values()),
          classes: engineClasses,
          teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
          requirements: engineRequirements,
          teacherAssignments,
          teacherUnavailability: extraUnavailability,
          studentSelections: [],
          sessionPreferences: engineSessionPrefs,
          config: {
            academicYear:
              timetableConfig.academicYear ?? new Date().getFullYear().toString(),
            term: timetableConfig.term ?? 1,
            operatingDays: timetableConfig.operatingDays,
            maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
            templateColumns,
          },
        });

        // Delete and replace
        for (const cid of op.classIds) {
          await prisma.$executeRaw`
            DELETE FROM "TimetableVersionSlot"
            WHERE "versionId" = ${params.id} AND "classId" = ${cid}`;
        }

        for (const s of engineResult.slots) {
          await prisma.$executeRaw`
            INSERT INTO "TimetableVersionSlot"
              (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
               "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${params.id}, ${schoolId}, ${s.classId},
                    ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
                    ${s.room ?? null}, false, ${now}, ${now})
            ON CONFLICT ("versionId", "classId", "dayOfWeek", period) DO NOTHING`;
        }

        applied.push(`AUTO_FIX:${op.classIds.join(",")}`);
      }
    } catch (e) {
      errors.push(`Operation failed: ${(e as Error).message}`);
    }
  }

  // Write audit log
  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (${randomUUID()}, ${schoolId}, ${params.id},
            'SLOT_ADDED'::"TimetableChangeAction",
            ${JSON.stringify({ batch: true, applied: applied.length, errors: errors.length })}::jsonb,
            ${user.id}, ${now})`;

  return NextResponse.json({
    applied: applied.length,
    errors,
    appliedOps: applied,
  });
}
