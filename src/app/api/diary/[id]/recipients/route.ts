import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { resolveStatus } from "../../_lib";

// ── GET /api/diary/[id]/recipients ────────────────────────────────────────────
// Stats and list are based on parentStatus so the teacher sees what parents
// have confirmed, not a teacher-side toggle.

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

  // Load recipients — resolved status is based on parentStatus
  const rawRecipients = await prisma.diaryRecipient.findMany({
    where: {
      diaryEntryId: params.id,
      ...(search ? { student: { fullName: { contains: search, mode: "insensitive" as const } } } : {}),
      ...(cursor  ? { id: { gt: cursor } } : {}),
    },
    select: {
      id:               true,
      studentId:        true,
      parentStatus:     true,
      parentCompletedAt: true,
      student: { select: { id: true, fullName: true, admissionNumber: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }],
    take:    LIMIT + 1,
  });

  const withStatus = rawRecipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(
      r.parentStatus as "PENDING" | "COMPLETED",
      entry.dueDate
    ),
  }));

  const filtered   = status ? withStatus.filter((r) => r.resolvedStatus === status) : withStatus;
  const hasMore    = filtered.length > LIMIT;
  const page       = hasMore ? filtered.slice(0, LIMIT) : filtered;
  const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

  // Completion stats — aggregate from ALL recipients (not paginated), based on parentStatus
  const allRecipients = await prisma.diaryRecipient.findMany({
    where:  { diaryEntryId: params.id },
    select: { parentStatus: true },
  });

  const stats = allRecipients.reduce(
    (acc, r) => {
      const resolved = resolveStatus(r.parentStatus as "PENDING" | "COMPLETED", entry.dueDate);
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
