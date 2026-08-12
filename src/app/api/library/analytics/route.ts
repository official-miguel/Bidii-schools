/**
 * GET /api/library/analytics
 *
 * School-wide library analytics for the intelligence dashboard:
 *   - Popular books (most borrowed in period)
 *   - Least-used books (never or rarely borrowed)
 *   - Newly added (last 30 days)
 *   - Frequently renewed
 *   - Reference-only materials (0 borrows, REFERENCE category)
 *   - Overdue trends (borrows per month)
 *   - Subject/form distribution of borrows
 *
 * ?days=30|90|365  — lookback window (default 90)
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days  = Math.min(Number(req.nextUrl.searchParams.get("days") ?? "90"), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  const [
    popularRaw,
    leastUsedRaw,
    newlyAdded,
    frequentlyRenewedRaw,
    overdueByMonth,
    subjectDistribution,
    formDistribution,
    overallStats,
  ] = await Promise.all([

    // Popular — catalogues ranked by borrow count in window
    prisma.$queryRaw<{ id: string; title: string; subject: string | null; form: number | null; borrowCount: bigint }[]>`
      SELECT lc.id, lc.title, lc.subject, lc.form,
             COUNT(lb.id)::bigint AS "borrowCount"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${user.schoolId!}
        AND lb."borrowedAt" >= ${since}
      GROUP BY lc.id, lc.title, lc.subject, lc.form
      ORDER BY "borrowCount" DESC
      LIMIT 20
    `,

    // Least used — catalogues with 0 borrows in window
    prisma.libraryCatalogue.findMany({
      where: {
        schoolId: user.schoolId!, archivedAt: null,
        copies: { none: { borrows: { some: { borrowedAt: { gte: since } } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true, title: true, subject: true, form: true, category: true, totalCopies: true, createdAt: true },
    }),

    // Newly added catalogues
    prisma.libraryCatalogue.findMany({
      where: { schoolId: user.schoolId!, archivedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, subject: true, form: true, category: true, totalCopies: true, createdAt: true },
    }),

    // Frequently renewed — avg renewals > 0.7 per borrow in window
    prisma.$queryRaw<{ id: string; title: string; subject: string | null; avgRenewals: number }[]>`
      SELECT lc.id, lc.title, lc.subject,
             ROUND(AVG(lb."renewalCount")::numeric, 2)::float AS "avgRenewals"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${user.schoolId!}
        AND lb."borrowedAt" >= ${since}
      GROUP BY lc.id, lc.title, lc.subject
      HAVING AVG(lb."renewalCount") > 0.7
      ORDER BY "avgRenewals" DESC
      LIMIT 15
    `,

    // Overdue borrows grouped by month
    prisma.$queryRaw<{ month: string; overdueCount: bigint }[]>`
      SELECT TO_CHAR("dueAt", 'YYYY-MM') AS month,
             COUNT(*)::bigint            AS "overdueCount"
      FROM "LibraryBorrow"
      WHERE "schoolId"  = ${user.schoolId!}
        AND "dueAt"     >= ${since}
        AND "returnedAt" IS NULL
        AND "dueAt"     < NOW()
      GROUP BY month
      ORDER BY month ASC
    `,

    // Borrows by subject
    prisma.$queryRaw<{ subject: string; borrowCount: bigint }[]>`
      SELECT COALESCE(lc.subject, 'Unknown') AS subject,
             COUNT(lb.id)::bigint            AS "borrowCount"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${user.schoolId!}
        AND lb."borrowedAt" >= ${since}
      GROUP BY lc.subject
      ORDER BY "borrowCount" DESC
      LIMIT 15
    `,

    // Borrows by form
    prisma.$queryRaw<{ form: number | null; borrowCount: bigint }[]>`
      SELECT lc.form,
             COUNT(lb.id)::bigint AS "borrowCount"
      FROM "LibraryCatalogue" lc
      JOIN "LibraryCopy" lcp ON lcp."catalogueId" = lc.id
      JOIN "LibraryBorrow" lb ON lb."copyId" = lcp.id
      WHERE lc."schoolId" = ${user.schoolId!}
        AND lb."borrowedAt" >= ${since}
      GROUP BY lc.form
      ORDER BY "borrowCount" DESC
    `,

    // Overall summary
    prisma.libraryBorrow.aggregate({
      where: { schoolId: user.schoolId!, borrowedAt: { gte: since } },
      _count: { id: true },
      _sum:   { renewalCount: true, fineAmount: true },
    }),
  ]);

  const body = {
    window:   { days, since: since.toISOString() },
    popular:  popularRaw.map((r: { id: string; title: string; subject: string | null; form: number | null; borrowCount: bigint }) => ({ ...r, borrowCount: Number(r.borrowCount) })),
    leastUsed: leastUsedRaw,
    newlyAdded,
    frequentlyRenewed: frequentlyRenewedRaw,
    overdueByMonth:    overdueByMonth.map((r: { month: string; overdueCount: bigint }) => ({ ...r, overdueCount: Number(r.overdueCount) })),
    subjectDistribution: subjectDistribution.map((r: { subject: string; borrowCount: bigint }) => ({ ...r, borrowCount: Number(r.borrowCount) })),
    formDistribution:    formDistribution.map((r: { form: number | null; borrowCount: bigint }) => ({ ...r, borrowCount: Number(r.borrowCount) })),
    summary: {
      totalBorrows:   overallStats._count.id,
      totalRenewals:  overallStats._sum.renewalCount ?? 0,
      totalFines:     overallStats._sum.fineAmount   ?? 0,
    },
  };

  const etag = `"${createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0,16)}"`;
  return NextResponse.json(body, { headers: { ETag: etag, "Cache-Control": "private, max-age=300" } });
}
