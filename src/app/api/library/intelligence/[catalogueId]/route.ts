/**
 * GET /api/library/intelligence/[catalogueId]
 *
 * Lifetime intelligence record for a catalogue entry:
 *   - All copies with their full borrow + condition history
 *   - Circulation statistics (borrow count, avg hold time, return conditions)
 *   - Active reservations and waitlist
 *   - Recent circulation events
 *   - Intelligent recommendations (frequently renewed, overdue patterns)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

type Params = { params: { catalogueId: string } };
async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const catalogue = await prisma.libraryCatalogue.findFirst({
    where: { id: params.catalogueId, schoolId: user.schoolId! },
  });
  if (!catalogue) return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });

  const [copies, reservations, events, borrowAgg] = await Promise.all([
    // All copies with their full borrow history
    prisma.libraryCopy.findMany({
      where: { catalogueId: params.catalogueId, schoolId: user.schoolId! },
      orderBy: { accessionNumber: "asc" },
      include: {
        borrows: {
          orderBy: { borrowedAt: "desc" },
          include: {
            card: {
              select: {
                studentId: true,
                student: { select: { id: true, fullName: true, admissionNumber: true, schoolClass: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),

    // Active + pending reservations
    prisma.libraryReservation.findMany({
      where: { catalogueId: params.catalogueId, schoolId: user.schoolId!, status: { in: ["PENDING","ACTIVE"] } },
      orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }],
    }),

    // Last 100 circulation events
    prisma.libraryCirculationEvent.findMany({
      where: { catalogueId: params.catalogueId, schoolId: user.schoolId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),

    // Aggregate borrow stats — use raw SQL to avoid pre-migration 'copy' relation issue
    prisma.$queryRaw<{ count: bigint; totalRenewals: bigint; totalFines: number }[]>`
      SELECT COUNT(lb.id)::bigint AS count,
             COALESCE(SUM(lb."renewalCount"), 0)::bigint AS "totalRenewals",
             COALESCE(SUM(lb."fineAmount"), 0)::float AS "totalFines"
      FROM "LibraryBorrow" lb
      JOIN "LibraryCopy" lcp ON lcp.id = lb."copyId"
      WHERE lcp."catalogueId" = ${params.catalogueId}
        AND lb."schoolId" = ${user.schoolId!}
    `.catch(() => [{ count: BigInt(0), totalRenewals: BigInt(0), totalFines: 0 }]),
  ]);

  // ── Compute statistics ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBorrows = (copies as any[]).flatMap((c) => c.borrows ?? []);
  const returned   = allBorrows.filter((b) => b.returnedAt);
  const active     = allBorrows.filter((b) => !b.returnedAt);
  const overdue    = active.filter((b) => new Date(b.dueAt) < new Date());

  // Average hold time (days) for returned borrows
  const avgHoldDays = returned.length > 0
    ? returned.reduce((sum, b) => {
        const ms = new Date(b.returnedAt!).getTime() - new Date(b.borrowedAt).getTime();
        return sum + ms / 86_400_000;
      }, 0) / returned.length
    : null;

  // Return condition distribution
  const conditionCounts: Record<string, number> = {};
  for (const b of returned) {
    const cond = (b as { returnCondition?: string | null }).returnCondition ?? "UNKNOWN";
    conditionCounts[cond] = (conditionCounts[cond] ?? 0) + 1;
  }

  // Most frequent borrowers (top 5)
  const borrowerMap = new Map<string, { student: unknown; count: number }>();
  for (const b of allBorrows) {
    const s = b.card.student;
    if (!s) continue;
    const existing = borrowerMap.get(s.id);
    if (existing) existing.count++;
    else borrowerMap.set(s.id, { student: s, count: 1 });
  }
  const topBorrowers = Array.from(borrowerMap.values())
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // High-renewal flag
  const aggRow = (borrowAgg as { count: bigint; totalRenewals: bigint; totalFines: number }[])[0]
    ?? { count: BigInt(0), totalRenewals: BigInt(0), totalFines: 0 };
  const totalRenewals    = Number(aggRow.totalRenewals);
  const totalBorrows     = Number(aggRow.count);
  const totalFinesCharged = aggRow.totalFines;
  const avgRenewals      = totalBorrows > 0 ? totalRenewals / totalBorrows : 0;
  const frequentlyRenewed = avgRenewals >= 0.8;

  // Overdue rate
  const overdueRate = totalBorrows > 0
    ? (overdue.length + returned.filter((b) => new Date(b.dueAt) < new Date(b.returnedAt!)).length) / totalBorrows
    : 0;

  // ── Recommendations ─────────────────────────────────────────────────────
  const recommendations: string[] = [];
  if (frequentlyRenewed)
    recommendations.push("Frequently renewed — consider ordering additional copies.");
  if (overdueRate > 0.4)
    recommendations.push(`High overdue rate (${(overdueRate * 100).toFixed(0)}%) — consider shortening the borrow period for this title.`);
  if (reservations.length > copies.filter((c: { status: string }) => c.status === "AVAILABLE").length)
    recommendations.push(`${reservations.length} patron${reservations.length === 1 ? "" : "s"} waiting — more copies recommended.`);
  if (copies.filter((c: { condition: string }) => c.condition === "DAMAGED" || c.condition === "FAIR").length > 0)
    recommendations.push("Some copies in poor condition — schedule for rebinding or replacement.");
  if (totalBorrows === 0 && copies.length > 2)
    recommendations.push("This title has never been borrowed — consider relocating or promoting it.");

  return NextResponse.json({
    catalogue,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    copies: (copies as any[]).map((c) => ({
      ...c,
      totalBorrows:  (c.borrows ?? []).length,
      activeBorrows: (c.borrows ?? []).filter((b: { returnedAt: unknown }) => !b.returnedAt).length,
    })),
    reservations,
    recentEvents: events,
    statistics: {
      totalBorrows,
      activeBorrows:    active.length,
      overdueCount:     overdue.length,
      totalRenewals,
      avgRenewals:      Math.round(avgRenewals * 100) / 100,
      avgHoldDays:      avgHoldDays != null ? Math.round(avgHoldDays * 10) / 10 : null,
      totalFinesCharged: totalFinesCharged,
      conditionDistribution: conditionCounts,
      frequentlyRenewed,
      overdueRate:       Math.round(overdueRate * 100) / 100,
    },
    topBorrowers,
    recommendations,
  });
}
