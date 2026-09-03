import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { resolveStatus } from "../../_lib";

// ── GET /api/diary/[id]/recipients ────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Ownership guard — teacher must own the entry
  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId,
      teacherId: teacher.id,
      deletedAt: null,
    },
    select: { id: true, dueDate: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sp     = req.nextUrl.searchParams;
  const search = sp.get("q")?.trim() || undefined;
  const status = sp.get("status")    || undefined;
  const cursor = sp.get("cursor")    || undefined;
  const LIMIT  = 20;

  // Load recipients — status filter is applied AFTER resolveStatus (OVERDUE is computed)
  const rawRecipients = await prisma.diaryRecipient.findMany({
    where: {
      diaryEntryId: params.id,
      ...(search ? { student: { fullName: { contains: search, mode: "insensitive" as const } } } : {}),
      ...(cursor  ? { id: { gt: cursor } } : {}),
    },
    include: {
      student: { select: { id: true, fullName: true, admissionNumber: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }],
    take:    LIMIT + 1,
  });

  const withStatus = rawRecipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(
      r.status as "PENDING" | "COMPLETED",
      entry.dueDate
    ),
  }));

  const filtered  = status ? withStatus.filter((r) => r.resolvedStatus === status) : withStatus;
  const hasMore   = filtered.length > LIMIT;
  const page      = hasMore ? filtered.slice(0, LIMIT) : filtered;
  const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

  // Completion stats — aggregate from ALL recipients (not paginated)
  const allRecipients = await prisma.diaryRecipient.findMany({
    where:  { diaryEntryId: params.id },
    select: { status: true },
  });

  const stats = allRecipients.reduce(
    (acc, r) => {
      const resolved = resolveStatus(r.status as "PENDING" | "COMPLETED", entry.dueDate);
      acc[resolved] = (acc[resolved] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;

  return NextResponse.json(
    {
      stats: {
        COMPLETED: stats.COMPLETED ?? 0,
        PENDING:   stats.PENDING   ?? 0,
        OVERDUE:   stats.OVERDUE   ?? 0,
        total:     allRecipients.length,
      },
      recipients: page,
    },
    { headers }
  );
}

// ── PATCH /api/diary/[id]/recipients — Mark student complete/pending ──────────

const markSchema = z.object({
  studentId: z.string().cuid("Invalid student ID."),
  status:    z.enum(["COMPLETED", "PENDING"], {
    errorMap: () => ({ message: "Status must be COMPLETED or PENDING." }),
  }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = markSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Ownership guard
  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId,
      teacherId: teacher.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await prisma.diaryRecipient.updateMany({
    where: {
      diaryEntryId: params.id,
      studentId:    parsed.data.studentId,
    },
    data: {
      status:      parsed.data.status,
      completedAt: parsed.data.status === "COMPLETED" ? new Date() : null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
