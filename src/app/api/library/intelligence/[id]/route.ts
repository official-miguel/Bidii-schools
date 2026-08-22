/**
 * GET /api/library/intelligence/[id]
 *
 * "Book Intelligence" — rich analytics for a single catalogue entry.
 *
 * Returns:
 *   - catalogue     : core metadata
 *   - copies        : each physical copy with its borrow history
 *   - reservations  : active/pending reservations
 *   - recentEvents  : last 20 circulation events
 *   - statistics    : aggregated metrics
 *   - topBorrowers  : top 5 most frequent borrowers
 *   - recommendations: human-readable librarian suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const catalogueId = params.id;

  // ── Load catalogue ────────────────────────────────────────────────────────
  const catalogue = await prisma.libraryCatalogue.findFirst({
    where: { id: catalogueId, schoolId: user.schoolId! },
    select: {
      id: true, title: true, author: true, bookNumber: true,
      subject: true, form: true, category: true, shelf: true,
      costPerCopy: true,
    },
  });

  if (!catalogue)
    return NextResponse.json({ error: "Book not found." }, { status: 404 });

  // ── Load copies with borrow history ──────────────────────────────────────
  const rawCopies = await prisma.libraryCopy.findMany({
    where:   { catalogueId, schoolId: user.schoolId! },
    orderBy: { accessionNumber: "asc" },
    select: {
      id: true, accessionNumber: true, status: true, condition: true,
      borrows: {
        orderBy: { borrowedAt: "desc" },
        take:    50,
        select: {
          id: true, borrowedAt: true, dueAt: true, returnedAt: true,
          renewalCount: true, fineAmount: true, returnCondition: true,
          card: {
            select: {
              student: {
                select: {
                  id: true, fullName: true, admissionNumber: true,
                  schoolClass: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const copies = rawCopies.map(copy => ({
    id:            copy.id,
    accessionNumber: copy.accessionNumber,
    status:        copy.status,
    condition:     copy.condition,
    totalBorrows:  copy.borrows.length,
    activeBorrows: copy.borrows.filter(b => !b.returnedAt).length,
    borrows:       copy.borrows,
  }));

  // ── Reservations ──────────────────────────────────────────────────────────
  const reservations = await prisma.libraryReservation.findMany({
    where:   { catalogueId, schoolId: user.schoolId!, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { queuePosition: "asc" },
    select: {
      id: true, status: true, reservationType: true,
      queuePosition: true, createdAt: true,
    },
  });

  // ── Recent circulation events ─────────────────────────────────────────────
  const recentEvents = await prisma.libraryCirculationEvent.findMany({
    where:   { catalogueId, schoolId: user.schoolId! },
    orderBy: { createdAt: "desc" },
    take:    20,
    select: {
      id: true, eventType: true, createdAt: true, studentId: true, payload: true,
    },
  });

  // ── Statistics ────────────────────────────────────────────────────────────

  // Flatten all borrows across all copies
  const allBorrows = rawCopies.flatMap(c => c.borrows);

  const totalBorrows     = allBorrows.length;
  const activeBorrows    = allBorrows.filter(b => !b.returnedAt).length;
  const now              = new Date();
  const overdueCount     = allBorrows.filter(b => !b.returnedAt && new Date(b.dueAt) < now).length;
  const totalRenewals    = allBorrows.reduce((s, b) => s + b.renewalCount, 0);
  const avgRenewals      = totalBorrows > 0 ? totalRenewals / totalBorrows : 0;
  const totalFinesCharged = allBorrows.reduce((s, b) => s + (b.fineAmount ?? 0), 0);

  // Average hold duration (returned borrows only)
  const returnedBorrows = allBorrows.filter(b => b.returnedAt);
  const avgHoldDays = returnedBorrows.length > 0
    ? returnedBorrows.reduce((sum, b) => {
        const days = (new Date(b.returnedAt!).getTime() - new Date(b.borrowedAt).getTime()) / 86_400_000;
        return sum + days;
      }, 0) / returnedBorrows.length
    : null;

  // Condition distribution across returned borrows
  const conditionDistribution: Record<string, number> = {};
  for (const b of returnedBorrows) {
    const cond = (b as { returnCondition?: string | null }).returnCondition ?? "UNKNOWN";
    conditionDistribution[cond] = (conditionDistribution[cond] ?? 0) + 1;
  }

  const overdueRate     = totalBorrows > 0 ? overdueCount / totalBorrows : 0;
  const frequentlyRenewed = avgRenewals > 1.5;

  // ── Top borrowers ─────────────────────────────────────────────────────────
  const borrowerMap = new Map<string, { student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } }; count: number }>();
  for (const b of allBorrows) {
    const s = b.card?.student;
    if (!s) continue;
    const existing = borrowerMap.get(s.id);
    if (existing) {
      existing.count++;
    } else {
      borrowerMap.set(s.id, { student: s, count: 1 });
    }
  }
  const topBorrowers = Array.from(borrowerMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations: string[] = [];

  if (overdueCount > 0)
    recommendations.push(`${overdueCount} active borrow${overdueCount > 1 ? "s are" : " is"} overdue — consider sending reminders.`);

  if (rawCopies.filter(c => c.status === "AVAILABLE").length === 0 && reservations.length > 0)
    recommendations.push("All copies are checked out with pending reservations. Consider procuring additional copies.");

  if (frequentlyRenewed)
    recommendations.push("High renewal rate suggests strong demand. Consider increasing the number of copies.");

  if (overdueRate > 0.3)
    recommendations.push(`${(overdueRate * 100).toFixed(0)}% overdue rate is above threshold — consider a shorter borrow period for this title.`);

  const damagedCount = rawCopies.filter(c => c.condition === "DAMAGED" || c.condition === "FAIR").length;
  if (damagedCount > 0)
    recommendations.push(`${damagedCount} cop${damagedCount > 1 ? "ies are" : "y is"} in fair or damaged condition — consider replacement.`);

  if (totalBorrows === 0)
    recommendations.push("This book has never been borrowed. Consider featuring it in a display or updating its catalogue metadata.");

  return NextResponse.json({
    catalogue,
    copies,
    reservations,
    recentEvents,
    statistics: {
      totalBorrows,
      activeBorrows,
      overdueCount,
      totalRenewals,
      avgRenewals,
      avgHoldDays,
      totalFinesCharged,
      conditionDistribution,
      frequentlyRenewed,
      overdueRate,
    },
    topBorrowers,
    recommendations,
  });
}
