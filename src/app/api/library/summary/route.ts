/**
 * GET /api/library/summary
 *
 * Returns school-wide library statistics for the dashboard.
 * Includes both v1 and v2 counts for a single source of truth.
 *
 * Optimised: all queries run concurrently; ETag + Cache-Control for
 * HTTP-level cache reuse (60 s client-side).
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = user.schoolId!;

  const [
    // Catalogue / copy counts
    catalogueCount,
    activeCopies,
    borrowedCopies,
    // Card stats
    cardAgg,
    activeCards,
    suspendedCards,
    // Borrow stats
    overdueCount,
    // Fine stats
    studentsWithFines,
    // Recent activity — last 5 borrows
    recentBorrows,
  ] = await Promise.all([
    prisma.libraryCatalogue.count({
      where: { schoolId, archivedAt: null },
    }),
    prisma.libraryCopy.count({
      where: { schoolId, archivedAt: null },
    }),
    prisma.libraryCopy.count({
      where: { schoolId, status: "BORROWED" },
    }),
    prisma.libraryCard.aggregate({
      where: { schoolId },
      _sum:   { fineBalance: true, totalFinesPaid: true },
      _count: { id: true },
    }),
    prisma.libraryCard.count({
      where: { schoolId, status: "ACTIVE" },
    }),
    prisma.libraryCard.count({
      where: { schoolId, status: "SUSPENDED" },
    }),
    prisma.libraryBorrow.count({
      where: {
        schoolId,
        returnedAt:   null,
        fineStoppedAt: null,
        dueAt: { lt: new Date() },
      },
    }),
    prisma.libraryCard.count({
      where: { schoolId, fineBalance: { gt: 0 } },
    }),
    prisma.libraryBorrow.findMany({
      where: { schoolId },
      orderBy: { borrowedAt: "desc" },
      take: 5,
      select: {
        id: true, borrowedAt: true, dueAt: true, returnedAt: true,
        // copyId exists after migration; selecting it as raw id is safe regardless
        copyId: true,
        card: {
          select: {
            student: {
              select: { id: true, fullName: true, admissionNumber: true },
            },
          },
        },
        book: { select: { title: true, author: true } },
      },
    }),
  ]);

  const body = {
    // Catalogue
    totalCatalogueEntries: catalogueCount,
    totalCopies:           activeCopies,
    copiesCurrentlyOut:    borrowedCopies,
    copiesAvailable:       activeCopies - borrowedCopies,
    // Cards
    totalCards:       cardAgg._count.id,
    activeCards,
    suspendedCards,
    // Borrows
    overdueCount,
    // Fines
    totalFinesOutstanding: cardAgg._sum.fineBalance   ?? 0,
    totalFinesPaid:        cardAgg._sum.totalFinesPaid ?? 0,
    studentsWithFines,
    // Recent activity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentBorrows: (recentBorrows as any[]).map((b) => ({
      id:         b.id,
      borrowedAt: b.borrowedAt,
      dueAt:      b.dueAt,
      returnedAt: b.returnedAt,
      student:    b.card?.student,
      title:      b.book?.title ?? "Unknown",
      author:     b.book?.author ?? null,
      accession:  null,
    })),
  };

  const etag = `"${createHash("sha1")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 16)}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { "Cache-Control": "private, max-age=60", ETag: etag },
    });
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=60",
      ETag: etag,
    },
  });
}
