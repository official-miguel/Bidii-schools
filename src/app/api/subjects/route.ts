import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("SUBJECTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch regular subjects
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { teacherSubjects: true } },
    },
  });

  // Get subject IDs that are members of elective groups for marking
  const groupMemberSubjectIds = await prisma.electiveGroupMember.findMany({
    where: {
      group: { schoolId: user.schoolId! }
    },
    select: {
      subjectId: true,
      group: { select: { id: true, name: true } }
    }
  });

  const groupMemberMap = new Map();
  for (const member of groupMemberSubjectIds) {
    if (!groupMemberMap.has(member.subjectId)) {
      groupMemberMap.set(member.subjectId, []);
    }
    groupMemberMap.get(member.subjectId).push(member.group);
  }

  // Add group membership info to subjects
  const enrichedSubjects = subjects.map(subject => ({
    ...subject,
    isGroupMember: groupMemberMap.has(subject.id),
    memberOfGroups: groupMemberMap.get(subject.id) || []
  }));

  // Fetch elective groups and represent them as pseudo-subjects for timetable
  // A group acts like a subject with multiple component subjects
  const electiveGroups = await prisma.electiveGroup.findMany({
    where: { schoolId: user.schoolId! },
    include: {
      members: {
        select: {
          subjectId: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Transform groups into pseudo-subject format (they're treated as subjects in timetable)
  const groupAsSubjects = electiveGroups.map((group) => ({
    id: `GROUP_${group.id}`, // Prefix to distinguish from regular subjects
    name: `\u{1F4E6} ${group.name}`, // Visual indicator this is a group
    code: group.members.map((m) => m.subject.code).join("+"), // e.g., "FREN+SPAN"
    type: "ELECTIVE" as const,
    groupId: group.id,
    isGroup: true,
    applicableForms: group.scopeForm !== null ? [group.scopeForm] : [], // Forms this group applies to
    scopeStreams: group.scopeStreams, // Streams this group applies to (if any)
    memberSubjects: group.members.map((m) => ({
      id: m.subjectId,
      name: m.subject.name,
      code: m.subject.code,
    })),
    lessonsPerWeek: group.lessonsPerWeek,
    _count: { teacherSubjects: 0 }, // Groups don't have direct teacher assignments
    department: null,
  }));

  return NextResponse.json([...enrichedSubjects, ...groupAsSubjects]);
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters.")
    .max(10, "Code should be short, e.g. MTH.")
    .transform((s) => s.toUpperCase()),
  type: z.enum(["CORE", "ELECTIVE"]),
  departmentId: z.string().min(1, "Choose a department."),
  applicableForms: z.array(z.number().int().min(1)).min(1, "Select at least one form."),
  // Which curriculum framework this subject belongs to.
  frameworkType: z.enum(["EIGHT_FOUR_FOUR", "CBC", "CBE"]).optional().default("EIGHT_FOUR_FOUR"),
  // Timetable fields are optional - managed in the Timetable module.
  doubleLesson: z.boolean().optional().default(false),
  requiresSpecialRoom: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  // The department must belong to this school too, or a principal could
  // hang a subject off another school's department by guessing its id.
  const department = await prisma.department.findFirst({
    where: { id: parsed.data.departmentId, schoolId: user.schoolId! },
  });
  if (!department) {
    return NextResponse.json({ error: "Choose a valid department." }, { status: 400 });
  }

  try {
    // Assign the next sequential internalCode for this school (never reused).
    const last = await prisma.subject.findFirst({
      where: { schoolId: user.schoolId! },
      orderBy: { internalCode: "desc" },
      select: { internalCode: true },
    });
    const internalCode = (last?.internalCode ?? 0) + 1;

    const subject = await prisma.subject.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
        type: parsed.data.type,
        departmentId: parsed.data.departmentId,
        applicableForms: parsed.data.applicableForms,
        frameworkType: parsed.data.frameworkType,
        doubleLesson: parsed.data.doubleLesson,
        requiresSpecialRoom: parsed.data.requiresSpecialRoom || null,
        internalCode,
        schoolId: user.schoolId!,
      },
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A subject with that code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create subject." }, { status: 500 });
  }
}
