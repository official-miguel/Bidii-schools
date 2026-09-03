import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { getTeacherDiaryContext, createDiaryNotifications } from "./_lib";

// ── Validation schema ────────────────────────────────────────────────────────

const createSchema = z.object({
  subjectId:   z.string().cuid("Invalid subject."),
  classIds:    z.array(z.string().cuid()).min(1, "Select at least one class."),
  title:       z.string().trim().min(1, "Add a title before posting.").max(255),
  description: z.string().trim().optional(),
  entryType:   z.enum(["ASSIGNMENT", "HOMEWORK", "REVISION", "PROJECT", "ANNOUNCEMENT"], {
    errorMap: () => ({ message: "Choose a type for this entry." }),
  }),
  dueDate:     z.string().datetime({ offset: true }).optional().nullable(),
  studentIds:  z.array(z.string().cuid()).optional(), // undefined = all students in targeted classes
});

// ── POST /api/diary — Create a diary entry ────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { subjectId, classIds, title, description, entryType, dueDate, studentIds } = parsed.data;

  // Get teacher's authorization context
  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  // Validate teacher is authorized for every (classId, subjectId) pair
  for (const classId of classIds) {
    const key = `${classId}:${subjectId}`;
    if (!ctx.authorizedSet.has(key)) {
      return NextResponse.json(
        { error: "You can't post to this class because you are not assigned to teach this subject there." },
        { status: 403 }
      );
    }
  }

  // Load students in targeted classes only — never load all school students
  const allStudents = await prisma.student.findMany({
    where: {
      schoolId:   user.schoolId,
      classId:    { in: classIds },
      archivedAt: null,
    },
    select: { id: true },
  });

  let recipientStudentIds: string[];
  if (studentIds && studentIds.length > 0) {
    // Validate specific students belong to targeted classes
    const validIds = new Set(allStudents.map((s) => s.id));
    const invalid  = studentIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Some specified students do not belong to the targeted classes." },
        { status: 400 }
      );
    }
    recipientStudentIds = studentIds;
  } else {
    recipientStudentIds = allStudents.map((s) => s.id);
  }

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.diaryEntry.create({
        data: {
          schoolId:    user.schoolId,
          teacherId:   ctx.teacher.id,
          subjectId,
          title,
          description: description ?? null,
          entryType,
          dueDate:     dueDate ? new Date(dueDate) : null,
        },
      });

      await tx.diaryTarget.createMany({
        data: classIds.map((classId) => ({
          diaryEntryId: created.id,
          classId,
        })),
        skipDuplicates: true,
      });

      if (recipientStudentIds.length > 0) {
        await tx.diaryRecipient.createMany({
          data: recipientStudentIds.map((studentId) => ({
            diaryEntryId: created.id,
            studentId,
            schoolId:     user.schoolId,
            status:       "PENDING" as const,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // Fire-and-forget notifications — never block the response
    const subject = await prisma.subject.findUnique({
      where:  { id: subjectId },
      select: { name: true },
    });
    createDiaryNotifications(
      entry,
      recipientStudentIds,
      subject?.name ?? "Unknown Subject"
    );

    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (err) {
    console.error("[DiaryEntry] Creation failed:", err);
    return NextResponse.json(
      { error: "Something went wrong while posting the entry. Please try again." },
      { status: 500 }
    );
  }
}

// ── GET /api/diary — List teacher's diary entries ─────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  const sp         = req.nextUrl.searchParams;
  const typeFilter = sp.get("type") ?? undefined;
  const cursor     = sp.get("cursor") ?? undefined;
  const LIMIT      = 20;

  const entries = await prisma.diaryEntry.findMany({
    where: {
      schoolId:  user.schoolId,
      teacherId: ctx.teacher.id,
      deletedAt: null,
      ...(typeFilter ? { entryType: typeFilter as never } : {}),
      ...(cursor    ? { id:        { lt: cursor }        } : {}),
    },
    include: {
      subject: { select: { name: true } },
      targets: {
        include: { schoolClass: { select: { id: true, name: true } } },
      },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
    take:    LIMIT + 1,
  });

  const hasMore    = entries.length > LIMIT;
  const page       = hasMore ? entries.slice(0, LIMIT) : entries;
  const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;

  return NextResponse.json(page, { headers });
}
