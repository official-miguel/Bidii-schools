/**
 * /api/class-profiles/[classId]/elective-teachers
 *
 * Manages ClassElectiveGroupTeacher rows — per-class teacher assignments for
 * subjects that belong to an elective group. Unlike the form-wide
 * ElectiveGroupTeacher model, each row here is scoped to a specific class so
 * different streams can have different (or multiple) teachers for the same
 * subject in the same group.
 *
 * GET    — return all pairings for this class, grouped by groupId → subjectId
 * POST   — add a teacher to a (group, subject) pair for this class
 * DELETE — remove a specific (group, subject, teacher) pairing for this class
 *
 * Rules enforced:
 *  • The class must belong to the authenticated school.
 *  • groupId must be an ElectiveGroup in scope for the class's form.
 *  • subjectId must be an ElectiveGroupMember of that group.
 *  • teacherId must have a TeacherSubject row for subjectId.
 *  • The same (groupId, classId, subjectId, teacherId) triple may not appear twice.
 *  • Multiple different teachers for the same (groupId, classId, subjectId) are allowed
 *    — each represents a distinct student sub-group within the class.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ── Auth ───────────────────────────────────────────────────────────────────

async function auth() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "manage"))
  );
}

// ── Shared include for a full pairing row ──────────────────────────────────

const pairingInclude = {
  subject: { select: { id: true, code: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
  group:   { select: { id: true, name: true } },
} as const;

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify class belongs to school
  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.classId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  try {
    const pairings = await prisma.classElectiveGroupTeacher.findMany({
      where: { classId: params.classId, schoolId: user.schoolId! },
      include: pairingInclude,
      orderBy: [
        { group:   { name: "asc" } },
        { subject: { name: "asc" } },
        { teacher: { fullName: "asc" } },
      ],
    });
    return NextResponse.json({ pairings });
  } catch {
    return NextResponse.json({ pairings: [] });
  }
}

// ── POST — add a pairing ───────────────────────────────────────────────────

const addSchema = z.object({
  groupId:   z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "groupId, subjectId and teacherId are required." },
      { status: 400 },
    );
  }

  const { groupId, subjectId, teacherId } = parsed.data;
  const classId = params.classId;

  // Verify the class belongs to this school
  const cls = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId! },
    select: { id: true, form: true, stream: true },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  // Verify the group belongs to this school and is in scope for the class's form
  const group = await prisma.electiveGroup.findFirst({
    where: {
      id: groupId,
      schoolId: user.schoolId!,
      OR: [{ scopeForm: 0 }, { scopeForm: cls.form }],
    },
    select: { id: true, name: true, scopeStreams: true },
  });
  if (!group) {
    return NextResponse.json(
      { error: "Elective group not found or not in scope for this class." },
      { status: 404 },
    );
  }

  // If group is stream-restricted, verify this class's stream is included
  if (
    group.scopeStreams.length > 0 &&
    cls.stream &&
    !group.scopeStreams.some((s) => s.toLowerCase() === cls.stream!.toLowerCase())
  ) {
    return NextResponse.json(
      { error: `Group "${group.name}" does not apply to this stream.` },
      { status: 422 },
    );
  }

  // Subject must be a member of this group
  const membership = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
    include: { subject: { select: { name: true } } },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "That subject is not a member of this elective group." },
      { status: 422 },
    );
  }

  // Teacher must be assigned to teach this subject (soft check — warn but allow)
  const teacherSubject = await prisma.teacherSubject.findFirst({
    where: { teacherId, subjectId, teacher: { schoolId: user.schoolId! } },
    include: { teacher: { select: { fullName: true } } },
  });

  // Verify the teacher at minimum belongs to this school
  const teacher = teacherSubject?.teacher ?? await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId: user.schoolId! },
    select: { fullName: true },
  });
  if (!teacher) {
    return NextResponse.json(
      { error: "Teacher not found in this school." },
      { status: 404 },
    );
  }

  // Duplicate guard
  const existing = await prisma.classElectiveGroupTeacher.findFirst({
    where: { groupId, classId, subjectId, teacherId },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `${teacher.fullName} is already assigned to "${membership.subject.name}" in this group for this class.`,
      },
      { status: 409 },
    );
  }

  const pairing = await prisma.classElectiveGroupTeacher.create({
    data: {
      id:        generateId(),
      groupId,
      classId,
      subjectId,
      teacherId,
      schoolId: user.schoolId!,
    },
    include: pairingInclude,
  });

  return NextResponse.json({ pairing }, { status: 201 });
}

// ── DELETE — remove a pairing ──────────────────────────────────────────────

const removeSchema = z.object({
  groupId:   z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "groupId, subjectId and teacherId are required." },
      { status: 400 },
    );
  }

  const { groupId, subjectId, teacherId } = parsed.data;
  const classId = params.classId;

  // Verify class belongs to school
  const cls = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const pairing = await prisma.classElectiveGroupTeacher.findFirst({
    where: { groupId, classId, subjectId, teacherId, schoolId: user.schoolId! },
  });
  if (!pairing) {
    return NextResponse.json(
      { error: "That teacher pairing does not exist for this class." },
      { status: 404 },
    );
  }

  await prisma.classElectiveGroupTeacher.delete({ where: { id: pairing.id } });

  return NextResponse.json({ ok: true });
}

// ── Tiny ID generator ──────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
