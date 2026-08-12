import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { collapseGroupSlotsForDisplay } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";

type Ctx = { params: { id: string } };

async function ownsVersion(versionId: string, schoolId: string) {
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${versionId} AND "schoolId" = ${schoolId}
  `;
  return rows[0] ?? null;
}

// ── GET /api/timetable/v2/versions/[id]/slots ─────────────────────────────
// Returns all slots for this version, with subject/teacher names resolved.

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const version = await ownsVersion(params.id, schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const classId = req.nextUrl.searchParams.get("classId");
  const teacherId = req.nextUrl.searchParams.get("teacherId");

  const slots = await prisma.$queryRaw<
    Array<{
      id: string; classId: string; className: string;
      dayOfWeek: number; period: number;
      subjectId: string; subjectCode: string; subjectName: string;
      teacherId: string; teacherName: string;
      room: string | null; isManual: boolean; notes: string | null;
      internalCode: number;
    }>
  >`
    SELECT
      s.id, s."classId", c.name AS "className",
      s."dayOfWeek", s.period,
      s."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
      s."teacherId", t."fullName" AS "teacherName",
      s.room, s."isManual", s.notes, sub."internalCode"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass"  c   ON c.id = s."classId"
    JOIN "Subject"      sub ON sub.id = s."subjectId"
    JOIN "Teacher"      t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}
    ${classId   ? Prisma.sql`AND s."classId"   = ${classId}`   : Prisma.empty}
    ${teacherId ? Prisma.sql`AND s."teacherId" = ${teacherId}` : Prisma.empty}
    ORDER BY s."dayOfWeek", s.period, c.name
  `;

  // ── Apply group display collapse logic ─────────────────────────────────
  // Fetch group information for collapse
  const electiveGroups = await prisma.electiveGroup.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      scopeForm: true,
      scopeStreams: true,
      lessonsPerWeek: true,
      doublesPerWeek: true,
      members: {
        select: { subjectId: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  // Build group descriptors for collapse function
  const groupDescriptors: GroupPayloadDescriptor[] = electiveGroups
    .filter((g) => g.members.length > 0)
    .map((g) => ({
      groupId: g.id,
      name: g.name,
      subjectIds: g.members.map((m) => m.subjectId),
      lessonsPerWeek: g.lessonsPerWeek,
      doublesPerWeek: g.doublesPerWeek ?? 0,
      classIds: [], // Not needed for display collapse
    }));

  // Build subjectId → groupId lookup so the client-side conflict engine can
  // apply the pooled-teaching exemption (same teacher, same subject, same group,
  // different classes = intentional co-scheduling, not a double-booking).
  const subjectToGroupId = new Map<string, string>();
  for (const g of electiveGroups) {
    for (const member of g.members) {
      if (!subjectToGroupId.has(member.subjectId)) {
        subjectToGroupId.set(member.subjectId, g.id);
      }
    }
  }

  // Apply collapse logic to show group names instead of individual subjects
  const displaySlots = collapseGroupSlotsForDisplay(slots, groupDescriptors);

  // Stamp groupId onto every returned slot so the builder's client-side
  // detectLiveConflicts can correctly exempt elective group co-scheduling
  // from TEACHER_DOUBLE_BOOKED false positives.
  const stamped = displaySlots.map((s) => ({
    ...s,
    groupId: subjectToGroupId.get(s.subjectId) ?? null,
  }));

  return NextResponse.json(stamped);
}

// ── POST /api/timetable/v2/versions/[id]/slots ────────────────────────────
// Adds a single slot to a DRAFT version with full conflict checking.

const addSchema = z.object({
  classId:   z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  period:    z.number().int().min(1).max(16),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  room:      z.string().trim().max(80).nullable().optional(),
  notes:     z.string().trim().max(200).nullable().optional(),
  isManual:  z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const version = await ownsVersion(params.id, schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot modify an archived version." }, { status: 409 });

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  let d = parsed.data;

  // Handle group subjects: convert GROUP_<id> back to anchor subject ID
  let groupId: string | null = null;
  let isGroupSubject = false;
  if (d.subjectId.startsWith("GROUP_")) {
    isGroupSubject = true;
    groupId = d.subjectId.substring(6); // Remove GROUP_ prefix
    // Get the anchor subject ID (first member of the group)
    const group = await prisma.electiveGroup.findUnique({
      where: { id: groupId },
      select: {
        members: { select: { subjectId: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!group?.members[0])
      return NextResponse.json({ error: "Group not found or has no members." }, { status: 400 });
    d = { ...d, subjectId: group.members[0].subjectId };
  }

  // Verify the class belongs to this school
  const classCheck = await prisma.schoolClass.findFirst({
    where: { id: d.classId, schoolId },
    select: { id: true },
  });
  if (!classCheck) return NextResponse.json({ error: "Class not found." }, { status: 400 });

  // For group subjects, we need to create slots for all members with their assigned teachers
  // For regular subjects, validate the teacher assignment
  if (isGroupSubject && d.teacherId === "GROUP_PLACEHOLDER") {
    // Group subject — fetch all members and their assigned teachers for this class
    if (!groupId) {
      return NextResponse.json({ error: "Group ID missing for group subject." }, { status: 400 });
    }

    // Get all group members
    const groupMembers = await prisma.electiveGroupMember.findMany({
      where: { groupId },
      select: { subjectId: true },
      orderBy: { createdAt: "asc" },
    });

    if (groupMembers.length === 0) {
      return NextResponse.json({ error: "Group has no member subjects." }, { status: 400 });
    }

    // Get all teacher assignments for this group + class
    const teacherAssignments = await prisma.classElectiveGroupTeacher.findMany({
      where: {
        groupId,
        classId: d.classId,
        schoolId,
      },
      select: { subjectId: true, teacherId: true },
    });

    if (teacherAssignments.length === 0) {
      return NextResponse.json({
        error: "No teachers assigned to this group for this class. Assign teachers in the class profile first.",
      }, { status: 400 });
    }

    // Build a map: subjectId → teacherId[]
    const subjectTeachers = new Map<string, string[]>();
    for (const ta of teacherAssignments) {
      const list = subjectTeachers.get(ta.subjectId) ?? [];
      list.push(ta.teacherId);
      subjectTeachers.set(ta.subjectId, list);
    }

    // Verify all group members have at least one teacher
    const missingTeachers: string[] = [];
    for (const member of groupMembers) {
      const teachers = subjectTeachers.get(member.subjectId);
      if (!teachers || teachers.length === 0) {
        const subject = await prisma.subject.findUnique({
          where: { id: member.subjectId },
          select: { name: true },
        });
        missingTeachers.push(subject?.name ?? member.subjectId);
      }
    }

    if (missingTeachers.length > 0) {
      return NextResponse.json({
        error: `Missing teacher assignments for: ${missingTeachers.join(", ")}. Assign them in the class profile first.`,
      }, { status: 400 });
    }

    // All validation passed — we'll create slots after conflict checks
    // Store the group data for later use
    d = { ...d, subjectId: groupMembers[0].subjectId, teacherId: teacherAssignments[0].teacherId };
  } else if (!isGroupSubject) {
    // Regular subject - validate teacher assignment
    const teacherCheck = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: d.teacherId,
        subjectId: d.subjectId,
        teacher: { schoolId },
      },
      select: { teacherId: true },
    });

    if (!teacherCheck)
      return NextResponse.json({ error: "That teacher is not assigned to this subject." }, { status: 400 });
  } else {
    // isGroupSubject is true but teacherId is not GROUP_PLACEHOLDER
    // This shouldn't happen from the UI, but handle it for safety
    return NextResponse.json({
      error: "Invalid teacher assignment for group subject.",
    }, { status: 400 });
  }

  // Check class conflict
  const classConflict = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id} AND "classId" = ${d.classId}
      AND "dayOfWeek" = ${d.dayOfWeek} AND period = ${d.period}
  `;
  if (classConflict.length > 0)
    return NextResponse.json({ error: "This class already has a lesson in that slot." }, { status: 409 });

  // Check teacher conflict
  // For group subjects, check all teachers that will be assigned
  let teachersToCheck: string[] = [];
  if (isGroupSubject && groupId) {
    const teacherAssignments = await prisma.classElectiveGroupTeacher.findMany({
      where: { groupId, classId: d.classId, schoolId },
      select: { teacherId: true },
    });
    teachersToCheck = [...new Set(teacherAssignments.map(ta => ta.teacherId))];
  } else {
    teachersToCheck = [d.teacherId];
  }

  // Check if any of these teachers have conflicts
  for (const teacherId of teachersToCheck) {
    const teacherConflict = await prisma.$queryRaw<Array<{ id: string; classId: string }>>`
      SELECT vs.id, vs."classId" FROM "TimetableVersionSlot" vs
      WHERE vs."versionId" = ${params.id} AND vs."teacherId" = ${teacherId}
        AND vs."dayOfWeek" = ${d.dayOfWeek} AND vs.period = ${d.period}
    `;
    if (teacherConflict.length > 0) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: teacherId },
        select: { fullName: true },
      });
      const clashClass = await prisma.schoolClass.findFirst({
        where: { id: teacherConflict[0].classId },
        select: { name: true },
      });
      return NextResponse.json({
        error: `${teacher?.fullName ?? "This teacher"} is already teaching ${clashClass?.name ?? "another class"} in that slot.`,
      }, { status: 409 });
    }
  }

  const now = new Date();
  const createdSlotIds: string[] = [];

  // If this is a group subject, create fan-out slots for all members
  if (isGroupSubject && groupId) {
    // Re-fetch group members and teacher assignments (we validated them earlier)
    const groupMembers = await prisma.electiveGroupMember.findMany({
      where: { groupId },
      select: { subjectId: true },
      orderBy: { createdAt: "asc" },
    });

    const teacherAssignments = await prisma.classElectiveGroupTeacher.findMany({
      where: {
        groupId,
        classId: d.classId,
        schoolId,
      },
      select: { subjectId: true, teacherId: true },
    });

    // Build a map: subjectId → teacherId[]
    const subjectTeachers = new Map<string, string[]>();
    for (const ta of teacherAssignments) {
      const list = subjectTeachers.get(ta.subjectId) ?? [];
      list.push(ta.teacherId);
      subjectTeachers.set(ta.subjectId, list);
    }

    // Create one slot per (subject, teacher) pair
    for (const member of groupMembers) {
      const teachers = subjectTeachers.get(member.subjectId) ?? [];
      for (const teacherId of teachers) {
        const slotId = randomUUID();
        await prisma.$executeRaw`
          INSERT INTO "TimetableVersionSlot"
            (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
             "subjectId", "teacherId", room, "isManual", notes, "createdAt", "updatedAt")
          VALUES (
            ${slotId}, ${params.id}, ${schoolId}, ${d.classId},
            ${d.dayOfWeek}, ${d.period}, ${member.subjectId}, ${teacherId},
            ${d.room ?? null}, ${d.isManual ?? true}, ${d.notes ?? null},
            ${now}, ${now}
          )
        `;
        createdSlotIds.push(slotId);
      }
    }
  } else {
    // Regular subject — create a single slot
    const slotId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersionSlot"
        (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
         "subjectId", "teacherId", room, "isManual", notes, "createdAt", "updatedAt")
      VALUES (
        ${slotId}, ${params.id}, ${schoolId}, ${d.classId},
        ${d.dayOfWeek}, ${d.period}, ${d.subjectId}, ${d.teacherId},
        ${d.room ?? null}, ${d.isManual ?? true}, ${d.notes ?? null},
        ${now}, ${now}
      )
    `;
    createdSlotIds.push(slotId);
  }

  // Log the change (use first slot ID for the log reference)
  const afterSnap = { classId: d.classId, subjectId: d.subjectId, teacherId: d.teacherId,
    dayOfWeek: d.dayOfWeek, period: d.period, room: d.room ?? null };

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", "slotId", action, "changeSource",
       "afterState", detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${schoolId}, ${params.id}, ${createdSlotIds[0]},
      'SLOT_ADDED'::"TimetableChangeAction", 'MANUAL',
      ${JSON.stringify(afterSnap)}::jsonb,
      ${JSON.stringify({ classId: d.classId, dayOfWeek: d.dayOfWeek, period: d.period })}::jsonb,
      ${user.id}, ${now}
    )
  `;

  const newSlot = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.*, sub.code AS "subjectCode", sub.name AS "subjectName",
           t."fullName" AS "teacherName", c.name AS "className"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s.id = ${createdSlotIds[0]}
  `;

  return NextResponse.json(newSlot[0], { status: 201 });
}

// ── DELETE /api/timetable/v2/versions/[id]/slots ──────────────────────────
// Removes a slot by slotId query param.

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const version = await ownsVersion(params.id, schoolId);
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (version.status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot modify an archived version." }, { status: 409 });

  const slotId = req.nextUrl.searchParams.get("slotId");
  if (!slotId) return NextResponse.json({ error: "slotId is required." }, { status: 400 });

  await prisma.$executeRaw`
    DELETE FROM "TimetableVersionSlot"
    WHERE id = ${slotId} AND "versionId" = ${params.id}
  `;

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", action, detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${schoolId}, ${params.id},
      'SLOT_REMOVED'::"TimetableChangeAction",
      ${JSON.stringify({ slotId })}::jsonb,
      ${user.id}, ${new Date()}
    )
  `;

  return NextResponse.json({ ok: true });
}
