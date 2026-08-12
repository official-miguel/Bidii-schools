/**
 * GET /api/library/analytics/executive
 *
 * One endpoint that returns every KPI and analytics dataset the principal
 * dashboard needs. All queries run concurrently; results are ETag-cached
 * for 5 minutes on the client.
 *
 * Query params:
 *   ?days=30|90|180|365  â€” lookback window (default 90)
 *   ?classId=            â€” filter to one class
 *   ?subject=            â€” filter to one subject
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  const days    = Math.min(Number(sp.get("days") ?? "90"), 730);
  const classId = sp.get("classId") ?? undefined;
  const subject = sp.get("subject") ?? undefined;
  const since   = new Date(Date.now() - days * 86_400_000);
  const sid     = user.schoolId;

  // â”€â”€ Run all queries concurrently â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [
    kpiRaw,
    valueRaw,
    overdueCount,
    borrowTrendRaw,
    peakHoursRaw,
    peakDaysRaw,
    topStudentsRaw,
    topClassesRaw,
    topTeachersRaw,
    popularBooksRaw,
    leastUsedRaw,
    mostOverdueRaw,
    fineKpiRaw,
    fineTrendRaw,
    topFinestudentsRaw,
    conditionRaw,
    neverBorrowedCount,
    repeatOffendersRaw,
    activeBorrowerCount,
    avgDurationRaw,
    returnComplianceRaw,
    subjectDistRaw,
    categoryDistRaw,
  ] = await Promise.all([

    // â”€â”€ KPI block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{
      totalTitles: bigint; totalCopies: bigint; available: bigint;
      borrowed: bigint; reserved: bigint; lost: bigint;
      damaged: bigint; archived: bigint;
    }[]>`
      SELECT
        COUNT(DISTINCT lc.id)::bigint                          AS "totalTitles",
        COUNT(lcp.id)::bigint                                  AS "totalCopies",
        SUM(CASE WHEN lcp.status = 'AVAILABLE' THEN 1 ELSE 0 END)::bigint  AS "available",
        SUM(CASE WHEN lcp.status = 'BORROWED'  THEN 1 ELSE 0 END)::bigint  AS "borrowed",
        SUM(CASE WHEN lcp.status = 'RESERVED'  THEN 1 ELSE 0 END)::bigint  AS "reserved",
        SUM(CASE WHEN lcp.condition= 'LOST'    THEN 1 ELSE 0 END)::bigint  AS "lost",
        SUM(CASE WHEN lcp.condition= 'DAMAGED' THEN 1 ELSE 0 END)::bigint  AS "damaged",
        SUM(CASE WHEN lcp."archivedAt" IS NOT NULL THEN 1 ELSE 0 END)::bigint AS "archived"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      WHERE lc."schoolId" = ${sid}
    `,

    // â”€â”€ Total inventory value â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ totalValue: number }[]>`
      SELECT COALESCE(SUM(lcp.cost), 0)::float AS "totalValue"
      FROM "LibraryCopy" lcp
      JOIN "LibraryCatalogue" lc ON lc.id = lcp."catalogueId"
      WHERE lc."schoolId" = ${sid} AND lcp."archivedAt" IS NULL
    `,

    // â”€â”€ Overdue count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.libraryBorrow.count({
      where: { schoolId: sid, returnedAt: null, dueAt: { lt: new Date() } },
    }),

    // â”€â”€ Borrow trend by day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT TO_CHAR(lb."borrowedAt", 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint                        AS count
      FROM "LibraryBorrow" lb
      ${classId ? Prisma.raw(`JOIN "LibraryCard" lcard ON lcard.id = lb."cardId" JOIN "Student" s ON s.id = lcard."studentId" AND s."classId" = ${classId}`) : Prisma.raw(``)}
      WHERE lb."schoolId" = ${sid}
        AND lb."borrowedAt" >= ${since}
      GROUP BY day ORDER BY day ASC
    `,

    // â”€â”€ Peak borrow hours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ hour: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM lb."borrowedAt")::int AS hour,
             COUNT(*)::bigint                         AS count
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
      GROUP BY hour ORDER BY hour ASC
    `,

    // â”€â”€ Peak borrow days of week â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ dow: number; count: bigint }[]>`
      SELECT EXTRACT(DOW FROM lb."borrowedAt")::int AS dow,
             COUNT(*)::bigint                        AS count
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
      GROUP BY dow ORDER BY dow ASC
    `,

    // â”€â”€ Top borrowing students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ studentId: string; fullName: string; admissionNumber: string; className: string; count: bigint }[]>`
      SELECT s.id AS "studentId", s."fullName", s."admissionNumber",
             sc.name AS "className", COUNT(lb.id)::bigint AS count
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lc ON lc.id = lb."cardId"
      JOIN "Student" s ON s.id = lc."studentId"
      JOIN "SchoolClass" sc ON sc.id = s."classId"
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
        ${classId ? Prisma.raw(`AND s."classId" = ${classId}`) : Prisma.raw(``)}
      GROUP BY s.id, s."fullName", s."admissionNumber", sc.name
      ORDER BY count DESC LIMIT 10
    `,

    // â”€â”€ Top borrowing classes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ classId: string; className: string; count: bigint }[]>`
      SELECT sc.id AS "classId", sc.name AS "className", COUNT(lb.id)::bigint AS count
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lcard ON lcard.id = lb."cardId"
      JOIN "Student" st ON st.id = lcard."studentId"
      JOIN "SchoolClass" sc ON sc.id = st."classId"
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
      GROUP BY sc.id, sc.name ORDER BY count DESC LIMIT 10
    `,

    // â”€â”€ Top borrowing teachers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ teacherId: string; fullName: string; count: bigint }[]>`
      SELECT t.id AS "teacherId", t."fullName", COUNT(lcl.id)::bigint AS count
      FROM "LibraryClassroomLoan" lcl
      JOIN "Teacher" t ON t.id = lcl."teacherId"
      WHERE lcl."schoolId" = ${sid} AND lcl."borrowedAt" >= ${since}
      GROUP BY t.id, t."fullName" ORDER BY count DESC LIMIT 10
    `,

    // â”€â”€ Popular books â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ id: string; title: string; subject: string | null; form: number | null; borrowCount: bigint }[]>`
      SELECT lc.id, lc.title, lc.subject, lc.form,
             COUNT(lb.id)::bigint AS "borrowCount"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
        ${subject ? Prisma.raw(`AND lc.subject = ${subject}`) : Prisma.raw(``)}
      GROUP BY lc.id, lc.title, lc.subject, lc.form
      ORDER BY "borrowCount" DESC LIMIT 15
    `,

    // â”€â”€ Least-used books â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ id: string; title: string; subject: string | null; form: number | null; lastBorrow: string | null }[]>`
      SELECT lc.id, lc.title, lc.subject, lc.form,
             MAX(lb."borrowedAt")::text AS "lastBorrow"
      FROM "LibraryCatalogue" lc
      LEFT JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      LEFT JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid} AND lc."archivedAt" IS NULL
      GROUP BY lc.id, lc.title, lc.subject, lc.form
      HAVING MAX(lb."borrowedAt") < ${since} OR MAX(lb."borrowedAt") IS NULL
      ORDER BY "lastBorrow" ASC NULLS FIRST LIMIT 15
    `,

    // â”€â”€ Most overdue books â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ id: string; title: string; overdueCount: bigint; maxDaysOverdue: number }[]>`
      SELECT lc.id, lc.title,
             COUNT(lb.id)::bigint AS "overdueCount",
             MAX(EXTRACT(DAY FROM NOW() - lb."dueAt"))::int AS "maxDaysOverdue"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid}
        AND lb."returnedAt" IS NULL AND lb."dueAt" < NOW()
      GROUP BY lc.id, lc.title ORDER BY "overdueCount" DESC LIMIT 10
    `,

    // â”€â”€ Fine KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ totalGenerated: number; outstanding: number; paid: number; waived: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN fa."eventType" = 'CHARGE' THEN fa.amount ELSE 0 END), 0)::float AS "totalGenerated",
        COALESCE(SUM(lcard."fineBalance"), 0)::float AS outstanding,
        COALESCE(SUM(lcard."totalFinesPaid"), 0)::float AS paid,
        COALESCE(SUM(CASE WHEN fa."eventType" = 'CLEAR'  THEN -fa.amount ELSE 0 END), 0)::float AS waived
      FROM "LibraryCard" lcard
      LEFT JOIN "LibraryFineAudit" fa ON fa."cardId" = lcard.id
      WHERE lcard."schoolId" = ${sid}
    `,

    // â”€â”€ Fine trend by month â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ month: string; charged: number; collected: number }[]>`
      SELECT TO_CHAR(fa."createdAt", 'YYYY-MM') AS month,
             COALESCE(SUM(CASE WHEN fa."eventType"='CHARGE' THEN fa.amount ELSE 0 END), 0)::float AS charged,
             COALESCE(SUM(CASE WHEN fa."eventType" IN ('PAYMENT','CLEAR') THEN -fa.amount ELSE 0 END), 0)::float AS collected
      FROM "LibraryFineAudit" fa
      WHERE fa."schoolId" = ${sid} AND fa."createdAt" >= ${since}
      GROUP BY month ORDER BY month ASC
    `,

    // â”€â”€ Top fine students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ studentId: string; fullName: string; admissionNumber: string; className: string; fineBalance: number }[]>`
      SELECT s.id AS "studentId", s."fullName", s."admissionNumber",
             sc.name AS "className", lcard."fineBalance"::float
      FROM "LibraryCard" lcard
      JOIN "Student" s ON s.id = lcard."studentId"
      JOIN "SchoolClass" sc ON sc.id = s."classId"
      WHERE lcard."schoolId" = ${sid} AND lcard."fineBalance" > 0
      ORDER BY lcard."fineBalance" DESC LIMIT 10
    `,

    // â”€â”€ Copy condition distribution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ condition: string; count: bigint }[]>`
      SELECT lcp.condition, COUNT(*)::bigint AS count
      FROM "LibraryCopy" lcp
      JOIN "LibraryCatalogue" lc ON lc.id = lcp."catalogueId"
      WHERE lc."schoolId" = ${sid} AND lcp."archivedAt" IS NULL
      GROUP BY lcp.condition
    `,

    // â”€â”€ Never-borrowed catalogue count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.libraryCatalogue.count({
      where: { schoolId: sid, archivedAt: null,
        copies: { none: { borrows: { some: {} } } } },
    }),

    // â”€â”€ Repeat overdue borrowers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ studentId: string; fullName: string; admissionNumber: string; overdueCount: bigint }[]>`
      SELECT s.id AS "studentId", s."fullName", s."admissionNumber",
             COUNT(lb.id)::bigint AS "overdueCount"
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lcard ON lcard.id = lb."cardId"
      JOIN "Student" s ON s.id = lcard."studentId"
      WHERE lb."schoolId" = ${sid}
        AND lb."returnedAt" IS NULL AND lb."dueAt" < NOW()
      GROUP BY s.id, s."fullName", s."admissionNumber"
      HAVING COUNT(lb.id) > 1
      ORDER BY "overdueCount" DESC LIMIT 10
    `,

    // â”€â”€ Active borrower count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.libraryCard.count({
      where: { schoolId: sid, currentBorrowCount: { gt: 0 } },
    }),

    // â”€â”€ Average borrow duration (days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ avgDays: number }[]>`
      SELECT ROUND(AVG(
        EXTRACT(DAY FROM COALESCE(lb."returnedAt", NOW()) - lb."borrowedAt")
      )::numeric, 1)::float AS "avgDays"
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
    `,

    // â”€â”€ Return compliance rate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ total: bigint; onTime: bigint }[]>`
      SELECT COUNT(*)::bigint AS total,
             SUM(CASE WHEN lb."returnedAt" <= lb."dueAt" THEN 1 ELSE 0 END)::bigint AS "onTime"
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
        AND lb."returnedAt" IS NOT NULL
    `,

    // â”€â”€ Borrows by subject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ subject: string; count: bigint }[]>`
      SELECT COALESCE(lc.subject, 'Unknown') AS subject, COUNT(lb.id)::bigint AS count
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
      GROUP BY lc.subject ORDER BY count DESC LIMIT 12
    `,

    // â”€â”€ Borrows by category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT lc.category, COUNT(lb.id)::bigint AS count
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid} AND lb."borrowedAt" >= ${since}
      GROUP BY lc.category ORDER BY count DESC
    `,
  ]);

  // â”€â”€ Serialise bigints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const n = (v: bigint | number | null | undefined) => v == null ? 0 : Number(v);
  const kpi        = kpiRaw[0] ?? {};
  const compliance = returnComplianceRaw[0];
  const avgDur     = avgDurationRaw[0];
  const totalValue = valueRaw[0]?.totalValue ?? 0;
  const fineKpi    = fineKpiRaw[0] ?? {};

  const body = {
    window: { days, since: since.toISOString() },

    kpis: {
      totalTitles:         n(kpi.totalTitles),
      totalCopies:         n(kpi.totalCopies),
      available:           n(kpi.available),
      borrowed:            n(kpi.borrowed),
      reserved:            n(kpi.reserved),
      lost:                n(kpi.lost),
      damaged:             n(kpi.damaged),
      archived:            n(kpi.archived),
      overdue:             overdueCount,
      activeBorrowers:     activeBorrowerCount,
      neverBorrowed:       neverBorrowedCount,
      totalInventoryValue: totalValue,
    },

    borrowing: {
      trend:         borrowTrendRaw.map((r: { day: string; count: bigint }) => ({ day: r.day, count: n(r.count) })),
      peakHours:     peakHoursRaw.map((r: { hour: number; count: bigint }) => ({ hour: r.hour, count: n(r.count) })),
      peakDays:      peakDaysRaw.map((r: { dow: number; count: bigint }) => ({ dow: r.dow, count: n(r.count) })),
      avgDurationDays: avgDur?.avgDays ?? null,
      returnCompliance: compliance
        ? { total: n(compliance.total), onTime: n(compliance.onTime),
            rate: n(compliance.total) > 0 ? Math.round(n(compliance.onTime) / n(compliance.total) * 100) : null }
        : null,
      topStudents:  topStudentsRaw.map((r: { studentId: string; fullName: string; admissionNumber: string; className: string; count: bigint }) => ({ ...r, count: n(r.count) })),
      topClasses:   topClassesRaw.map((r: { classId: string; className: string; count: bigint }) => ({ ...r, count: n(r.count) })),
      topTeachers:  topTeachersRaw.map((r: { teacherId: string; fullName: string; count: bigint }) => ({ ...r, count: n(r.count) })),
      subjectDist:  subjectDistRaw.map((r: { subject: string; count: bigint }) => ({ ...r, count: n(r.count) })),
      categoryDist: categoryDistRaw.map((r: { category: string; count: bigint }) => ({ ...r, count: n(r.count) })),
    },

    books: {
      popular:      popularBooksRaw.map((r: { id: string; title: string; subject: string | null; form: number | null; borrowCount: bigint }) => ({ ...r, borrowCount: n(r.borrowCount) })),
      leastUsed:    leastUsedRaw,
      mostOverdue:  mostOverdueRaw.map((r: { id: string; title: string; overdueCount: bigint; maxDaysOverdue: number }) => ({ ...r, overdueCount: n(r.overdueCount) })),
      conditionDist: conditionRaw.map((r: { condition: string; count: bigint }) => ({ condition: r.condition, count: n(r.count) })),
    },

    fines: {
      totalGenerated: fineKpi.totalGenerated ?? 0,
      outstanding:    fineKpi.outstanding    ?? 0,
      paid:           fineKpi.paid           ?? 0,
      waived:         fineKpi.waived         ?? 0,
      trend:          fineTrendRaw,
      topStudents:    topFinestudentsRaw,
    },

    students: {
      activeBorrowers: activeBorrowerCount,
      neverBorrowed:   neverBorrowedCount,
      repeatOffenders: repeatOffendersRaw.map((r: { studentId: string; fullName: string; admissionNumber: string; overdueCount: bigint }) => ({ ...r, overdueCount: n(r.overdueCount) })),
    },
  };

  const etag = `"${createHash("sha1").update(JSON.stringify({ kpi, days })).digest("hex").slice(0, 16)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=300" } });
  }
  return NextResponse.json(body, { headers: { ETag: etag, "Cache-Control": "private, max-age=300" } });
}

