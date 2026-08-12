/**
 * GET /api/library/analytics/report
 *
 * Filtered report generation â€” supports monthly, termly, annual views
 * with class/stream/subject/department filters.
 *
 * Params:
 *   ?from=YYYY-MM-DD   (required)
 *   ?to=YYYY-MM-DD     (required)
 *   ?classId=          (optional)
 *   ?subject=          (optional)
 *   ?category=         (optional)
 *   ?groupBy=month|week|day  (default month)
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

  const sp       = req.nextUrl.searchParams;
  const fromStr  = sp.get("from");
  const toStr    = sp.get("to");
  const classId  = sp.get("classId")  ?? undefined;
  const subject  = sp.get("subject")  ?? undefined;
  const category = sp.get("category") ?? undefined;
  const groupBy  = (sp.get("groupBy") ?? "month") as "month" | "week" | "day";
  const sid      = user.schoolId!;

  if (!fromStr || !toStr)
    return NextResponse.json({ error: "from and to dates are required." }, { status: 400 });

  const from = new Date(fromStr);
  const to   = new Date(toStr);
  to.setHours(23, 59, 59, 999);

  if (isNaN(from.getTime()) || isNaN(to.getTime()))
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });

  const dateFmt = groupBy === "day" ? "YYYY-MM-DD" : groupBy === "week" ? "IYYY-IW" : "YYYY-MM";

  const [
    borrowByPeriod,
    returnByPeriod,
    overdueByPeriod,
    finesByPeriod,
    topBooks,
    topStudents,
    topClasses,
    newBooks,
    summary,
  ] = await Promise.all([

    // Borrows grouped by period
    prisma.$queryRaw<{ period: string; count: bigint }[]>`
      SELECT TO_CHAR(lb."borrowedAt", ${dateFmt}) AS period,
             COUNT(*)::bigint AS count
      FROM "LibraryBorrow" lb
      ${classId ? Prisma.raw(`JOIN "LibraryCard" lcard ON lcard.id = lb."cardId" JOIN "Student" s ON s.id = lcard."studentId" AND s."classId" = ${classId}`) : Prisma.raw(``)}
      WHERE lb."schoolId" = ${sid}
        AND lb."borrowedAt" BETWEEN ${from} AND ${to}
      GROUP BY period ORDER BY period ASC
    `,

    // Returns grouped by period
    prisma.$queryRaw<{ period: string; count: bigint }[]>`
      SELECT TO_CHAR(lb."returnedAt", ${dateFmt}) AS period,
             COUNT(*)::bigint AS count
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid}
        AND lb."returnedAt" BETWEEN ${from} AND ${to}
      GROUP BY period ORDER BY period ASC
    `,

    // Overdue borrows grouped by period (dueAt in range, not returned)
    prisma.$queryRaw<{ period: string; count: bigint }[]>`
      SELECT TO_CHAR(lb."dueAt", ${dateFmt}) AS period,
             COUNT(*)::bigint AS count
      FROM "LibraryBorrow" lb
      WHERE lb."schoolId" = ${sid}
        AND lb."dueAt" BETWEEN ${from} AND ${to}
        AND lb."returnedAt" IS NULL
      GROUP BY period ORDER BY period ASC
    `,

    // Fines generated grouped by period
    prisma.$queryRaw<{ period: string; amount: number }[]>`
      SELECT TO_CHAR(fa."createdAt", ${dateFmt}) AS period,
             COALESCE(SUM(fa.amount), 0)::float AS amount
      FROM "LibraryFineAudit" fa
      WHERE fa."schoolId" = ${sid}
        AND fa."eventType" = 'CHARGE'
        AND fa."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY period ORDER BY period ASC
    `,

    // Top books in period
    prisma.$queryRaw<{ id: string; title: string; subject: string | null; borrowCount: bigint }[]>`
      SELECT lc.id, lc.title, lc.subject,
             COUNT(lb.id)::bigint AS "borrowCount"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${sid}
        AND lb."borrowedAt" BETWEEN ${from} AND ${to}
        ${subject  ? Prisma.raw(`AND lc.subject  = ${subject}`)  : Prisma.raw(``)}
        ${category ? Prisma.raw(`AND lc.category = ${category}`) : Prisma.raw(``)}
      GROUP BY lc.id, lc.title, lc.subject
      ORDER BY "borrowCount" DESC LIMIT 20
    `,

    // Top students in period
    prisma.$queryRaw<{ studentId: string; fullName: string; admissionNumber: string; className: string; count: bigint }[]>`
      SELECT s.id AS "studentId", s."fullName", s."admissionNumber",
             sc.name AS "className", COUNT(lb.id)::bigint AS count
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lcard ON lcard.id = lb."cardId"
      JOIN "Student" s ON s.id = lcard."studentId"
      JOIN "SchoolClass" sc ON sc.id = s."classId"
      WHERE lb."schoolId" = ${sid}
        AND lb."borrowedAt" BETWEEN ${from} AND ${to}
        ${classId ? Prisma.raw(`AND s."classId" = ${classId}`) : Prisma.raw(``)}
      GROUP BY s.id, s."fullName", s."admissionNumber", sc.name
      ORDER BY count DESC LIMIT 20
    `,

    // Top classes in period
    prisma.$queryRaw<{ classId: string; className: string; form: number; count: bigint }[]>`
      SELECT sc.id AS "classId", sc.name AS "className", sc.form,
             COUNT(lb.id)::bigint AS count
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lcard ON lcard.id = lb."cardId"
      JOIN "Student" st ON st.id = lcard."studentId"
      JOIN "SchoolClass" sc ON sc.id = st."classId"
      WHERE lb."schoolId" = ${sid}
        AND lb."borrowedAt" BETWEEN ${from} AND ${to}
      GROUP BY sc.id, sc.name, sc.form ORDER BY count DESC LIMIT 10
    `,

    // New books added in period
    prisma.libraryCatalogue.count({
      where: { schoolId: sid, createdAt: { gte: from, lte: to } },
    }),

    // Period summary totals
    prisma.$queryRaw<{ totalBorrows: bigint; totalReturns: bigint; uniqueBorrowers: bigint; totalFines: number }[]>`
      SELECT
        COUNT(DISTINCT lb.id)::bigint AS "totalBorrows",
        COUNT(DISTINCT CASE WHEN lb."returnedAt" IS NOT NULL THEN lb.id END)::bigint AS "totalReturns",
        COUNT(DISTINCT lcard."studentId")::bigint AS "uniqueBorrowers",
        COALESCE(SUM(lb."fineAmount"), 0)::float AS "totalFines"
      FROM "LibraryBorrow" lb
      JOIN "LibraryCard" lcard ON lcard.id = lb."cardId"
      WHERE lb."schoolId" = ${sid}
        AND lb."borrowedAt" BETWEEN ${from} AND ${to}
    `,
  ]);

  const n = (v: bigint | number | null | undefined) => v == null ? 0 : Number(v);
  const sum = summary[0] ?? {};

  const body = {
    meta: { from: from.toISOString(), to: to.toISOString(), groupBy, classId, subject, category },
    summary: {
      totalBorrows:      n(sum.totalBorrows),
      totalReturns:      n(sum.totalReturns),
      uniqueBorrowers:   n(sum.uniqueBorrowers),
      totalFinesCharged: sum.totalFines ?? 0,
      newBooksAdded:     newBooks,
    },
    trends: {
      borrows:   borrowByPeriod.map((r: { period: string; count: bigint }) => ({ period: r.period, count: n(r.count) })),
      returns:   returnByPeriod.map((r: { period: string; count: bigint }) => ({ period: r.period, count: n(r.count) })),
      overdue:   overdueByPeriod.map((r: { period: string; count: bigint }) => ({ period: r.period, count: n(r.count) })),
      fines:     finesByPeriod,
    },
    topBooks:    topBooks.map((r: { id: string; title: string; subject: string | null; borrowCount: bigint }) => ({ ...r, borrowCount: n(r.borrowCount) })),
    topStudents: topStudents.map((r: { studentId: string; fullName: string; admissionNumber: string; className: string; count: bigint }) => ({ ...r, count: n(r.count) })),
    topClasses:  topClasses.map((r: { classId: string; className: string; form: number; count: bigint }) => ({ ...r, count: n(r.count) })),
  };

  const etag = `"${createHash("sha1").update(JSON.stringify(body.summary)).digest("hex").slice(0, 16)}"`;
  return NextResponse.json(body, { headers: { ETag: etag, "Cache-Control": "private, max-age=300" } });
}

