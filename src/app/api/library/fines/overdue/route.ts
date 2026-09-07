/**
 * GET /api/library/fines/overdue
 *
 * Returns all unreturned borrows that are past their dueAt date, enriched
 * with student details, book info, and a real-time fine amount derived from
 * the school's finePerDay setting.
 *
 * Query params:
 *   q       — search by student name or admission number
 *   page    — 1-based page (default 1)
 *   perPage — page size (default 50, max 200)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
}

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const q       = sp.get("q")?.trim() ?? "";
  const page    = Math.max(1, Number(sp.get("page") ?? "1"));
  const perPage = Math.min(200, Math.max(1, Number(sp.get("perPage") ?? "50")));

  const now = new Date();

  // Load settings for finePerDay
  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId! },
    select: { finePerDay: true },
  });
  const finePerDay = settings?.finePerDay ?? 5;

  // Overdue borrows: not returned, past due date
  const where: any = {
    schoolId:   user.schoolId!,
    returnedAt: null,
    dueAt:      { lt: now },
  };

  if (q) {
    where.card = {
      student: {
        OR: [
          { fullName:        { contains: q, mode: "insensitive" } },
          { admissionNumber: { contains: q, mode: "insensitive" } },
        ],
      },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.libraryBorrow.count({ where }),
    prisma.libraryBorrow.findMany({
      where,
      orderBy: { dueAt: "asc" },
      skip:  (page - 1) * perPage,
      take:  perPage,
      include: {
        card: {
          select: {
            id:       true,
            status:   true,
            fineBalance: true,
            student: {
              select: { id: true, fullName: true, admissionNumber: true },
            },
          },
        },
        copy: {
          select: {
            accessionNumber: true,
            catalogue: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  // Check for active fine pauses (SCHOOL_WIDE or STUDENT scope)
  const activePauses = await prisma.libraryFinePause.findMany({
    where: {
      schoolId: user.schoolId!,
      isActive:  true,
      OR: [
        { scope: "SCHOOL_WIDE" },
        { scope: "STUDENT" },
      ],
    },
    select: { scope: true, studentId: true },
  });

  const schoolWidePaused = activePauses.some(p => p.scope === "SCHOOL_WIDE");
  const pausedStudentIds = new Set(
    activePauses.filter(p => p.scope === "STUDENT" && p.studentId).map(p => p.studentId!)
  );

  const items = rows.map(b => {
    const studentId = b.card?.student?.id ?? "";
    const finePaused =
      schoolWidePaused || pausedStudentIds.has(studentId);

    const overdueDays = finePaused
      ? 0
      : Math.max(0, Math.floor((now.getTime() - new Date(b.dueAt).getTime()) / 86_400_000));

    // fineAmount = stored amount + accrued since last update (if not paused)
    const accruedFine = finePaused ? 0 : overdueDays * finePerDay;
    const fineAmount  = Math.max(b.fineAmount, accruedFine);

    return {
      borrowId:        b.id,
      studentId,
      studentName:     b.card?.student?.fullName   ?? "Unknown",
      admissionNumber: b.card?.student?.admissionNumber ?? "",
      title:           b.copy?.catalogue?.title    ?? "Unknown book",
      accessionNumber: b.copy?.accessionNumber     ?? "",
      dueAt:           b.dueAt.toISOString(),
      overdueDays,
      fineAmount,
      cardStatus:      b.card?.status ?? "ACTIVE",
      finePaused,
    };
  });

  return NextResponse.json({ items, total, page, perPage });
}