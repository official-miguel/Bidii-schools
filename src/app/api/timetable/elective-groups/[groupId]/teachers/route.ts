/**
 * /api/timetable/elective-groups/[groupId]/teachers
 *
 * Manages ElectiveGroupTeacher rows — the group-level teacher-subject
 * pairings that replace per-class ClassSubjectTeacher assignments for any
 * subject that belongs to an elective group.
 *
 * POST   — add a teacher-subject pairing to the group
 * DELETE — remove a teacher-subject pairing  (body: { subjectId, teacherId })
 *
 * Rules enforced here:
 *  • subjectId must already be a member of this group (ElectiveGroupMember).
 *  • teacherId must be assigned to teach subjectId (TeacherSubject).
 *  • The same (groupId, subjectId, teacherId) triple may not appear twice.
 *  • A subject CAN appear in multiple rows (each row = a distinct sub-group
 *    of students taught by that teacher within the class).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function auth() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"))
  );
}

// ── POST — add teacher-subject pairing ────────────────────────────────────

const addSchema = z.object({
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "subjectId and teacherId are required" },
      { status: 400 },
    );
  }

  const { subjectId, teacherId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Subject must be a member of this group
  const membership = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
    include: { subject: { select: { name: true } } },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "That subject is not a member of this group. Add it as a member first." },
      { status: 422 },
    );
  }

  // Teacher must be assigned to teach this subject
  const teacherSubject = await prisma.teacherSubject.findFirst({
    where: { teacherId, subjectId, teacher: { schoolId } },
    include: { teacher: { select: { fullName: true } } },
  });
  if (!teacherSubject) {
    return NextResponse.json(
      { error: "That teacher is not assigned to teach this subject." },
      { status: 422 },
    );
  }

  // Duplicate guard
  const existing = await prisma.electiveGroupTeacher.findFirst({
    where: { groupId, subjectId, teacherId },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `${teacherSubject.teacher.fullName} is already assigned to "${membership.subject.name}" in this group.`,
      },
      { status: 409 },
    );
  }

  const pairing = await prisma.electiveGroupTeacher.create({
    data: {
      id: generateId(),
      groupId,
      subjectId,
      teacherId,
      schoolId,
    },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({ pairing }, { status: 201 });
}

// ── DELETE — remove teacher-subject pairing ───────────────────────────────

const removeSchema = z.object({
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "subjectId and teacherId are required" },
      { status: 400 },
    );
  }

  const { subjectId, teacherId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const pairing = await prisma.electiveGroupTeacher.findFirst({
    where: { groupId, subjectId, teacherId },
  });
  if (!pairing) {
    return NextResponse.json(
      { error: "That teacher-subject pairing does not exist in this group." },
      { status: 404 },
    );
  }

  await prisma.electiveGroupTeacher.delete({ where: { id: pairing.id } });

  return NextResponse.json({ ok: true });
}

// ── Tiny ID generator ──────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
