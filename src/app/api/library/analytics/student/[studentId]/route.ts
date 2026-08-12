/**
 * GET /api/library/analytics/student/[studentId]
 * Lifetime reading profile for one student — used on Student Cards page.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

type Params = { params: { studentId: string } };
async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view"));
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sid       = user.schoolId;
  const studentId = params.studentId;

  // Get card id first (pre-migration: libraryCard.findUnique may not have new fields)
  const cardRecord = await prisma.libraryCard.findUnique({ where: { studentId }, select: { id: true } });

  const [student, card, borrows, fineAudit] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId: sid },
      select: {
        id: true, fullName: true, admissionNumber: true,
        schoolClass: { select: { id: true, name: true, form: true } },
        files: { where: { mimeType: { startsWith: "image/" } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      },
    }),
    prisma.libraryCard.findUnique({ where: { studentId } }),
    prisma.libraryBorrow.findMany({
      // card relation + copy include not yet in generated client — raw where on cardId
      where: { schoolId: sid, cardId: cardRecord?.id ?? "" },
      orderBy: { borrowedAt: "desc" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as Promise<any[]>,
    prisma.libraryFineAudit.findMany({
      where: { schoolId: sid, cardId: cardRecord?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  // Type the borrow rows to silence pre-migration implicit-any warnings
  type BorrowRow = {
    id: string; cardId: string; borrowedAt: Date; returnedAt: Date | null;
    dueAt: Date; fineAmount: number; renewalCount: number;
    returnType?: string | null; returnCondition?: string | null;
    copy?: { catalogue?: { title: string; subject?: string | null } | null } | null;
    book?: { title: string } | null;
  };
  const typedBorrows = borrows as BorrowRow[];

  // ── Derived analytics ────────────────────────────────────────────────────
  const returned   = typedBorrows.filter(b => b.returnedAt);
  const active     = typedBorrows.filter(b => !b.returnedAt);
  const overdue    = active.filter(b => new Date(b.dueAt) < new Date());
  const lostBooks  = typedBorrows.filter(b => b.returnType === "LOST");
  const damagedBooks = typedBorrows.filter(b => b.returnType === "DAMAGED");

  // Favourite subjects (by borrow count)
  const subjectMap = new Map<string, number>();
  for (const b of typedBorrows) {
    const subj = b.copy?.catalogue?.subject ?? b.book?.title ?? "Unknown";
    subjectMap.set(subj, (subjectMap.get(subj) ?? 0) + 1);
  }
  const favouriteSubjects = Array.from(subjectMap.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([subject, count]) => ({ subject, count }));

  // Monthly reading activity (last 12 months)
  const monthMap = new Map<string, number>();
  for (const b of typedBorrows) {
    const m = new Date(b.borrowedAt).toISOString().slice(0, 7);
    monthMap.set(m, (monthMap.get(m) ?? 0) + 1);
  }
  const monthlyActivity = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  // Average hold days
  const avgHoldDays = returned.length > 0
    ? returned.reduce((s, b) => {
        return s + (new Date(b.returnedAt!).getTime() - new Date(b.borrowedAt).getTime()) / 86_400_000;
      }, 0) / returned.length
    : null;

  // Overdue rate
  const overdueRate = typedBorrows.length > 0
    ? overdue.length / typedBorrows.length
    : 0;

  return NextResponse.json({
    student,
    card,
    profile: {
      totalBorrows:      typedBorrows.length,
      activeBorrows:     active.length,
      returnedBorrows:   returned.length,
      overdueCount:      overdue.length,
      lostBookCount:     lostBooks.length,
      damagedBookCount:  damagedBooks.length,
      totalFinesCharged: card?.fineBalance ?? 0,
      totalFinesPaid:    card?.totalFinesPaid ?? 0,
      avgHoldDays:       avgHoldDays != null ? Math.round(avgHoldDays * 10) / 10 : null,
      overdueRate:       Math.round(overdueRate * 100) / 100,
      favouriteSubjects,
      monthlyActivity,
    },
    activeBorrows: active.map(b => ({
      id: b.id, borrowedAt: b.borrowedAt, dueAt: b.dueAt,
      title: b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown",
      isOverdue: new Date(b.dueAt) < new Date(),
    })),
    recentHistory: returned.slice(0, 20).map(b => ({
      id: b.id, borrowedAt: b.borrowedAt, returnedAt: b.returnedAt,
      dueAt: b.dueAt, fineAmount: b.fineAmount, renewalCount: b.renewalCount,
      title: b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown",
      subject: b.copy?.catalogue?.subject ?? null,
      returnCondition: b.returnCondition ?? null,
    })),
    fineAudit,
  });
}
