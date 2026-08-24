/**
 * POST /api/library/reservations/expire
 *
 * Expiry cron endpoint — processes overdue reservations server-side.
 * Should be called by a scheduled task (cron job, Vercel cron, etc.).
 *
 * Algorithm:
 *  1. Find all PENDING/ACTIVE reservations where expiresAt < NOW()
 *  2. Bulk-update them to EXPIRED
 *  3. For each released copy (formerly ACTIVE reservations with allocatedCopyId):
 *     - Run tryAutoAssign to offer the copy to the next PENDING patron
 *     - If no next patron: mark copy AVAILABLE
 *  4. Return { expired, reactivated }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { tryAutoAssign } from "@/lib/library/autoAssign";

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

export async function POST(_req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = user.schoolId!;
  const now      = new Date();

  // ── 1. Find all expired reservations ─────────────────────────────────────
  const expired = await prisma.libraryReservation.findMany({
    where: {
      schoolId,
      status:    { in: ["PENDING", "ACTIVE"] },
      expiresAt: { not: null, lt: now },
    },
    select: {
      id:             true,
      status:         true,
      allocatedCopyId: true,
      catalogueId:    true,
      studentId:      true,
    },
  });

  if (expired.length === 0) {
    return NextResponse.json({ expired: 0, reactivated: 0 });
  }

  const expiredIds = expired.map((r) => r.id);

  // ── 2. Bulk-expire all at once ────────────────────────────────────────────
  await prisma.libraryReservation.updateMany({
    where: { id: { in: expiredIds } },
    data:  { status: "EXPIRED" },
  });

  // ── 3. Process released copies (ACTIVE reservations with allocatedCopyId) ─
  const releasedCopies = expired.filter(
    (r): r is typeof r & { allocatedCopyId: string } =>
      r.status === "ACTIVE" && r.allocatedCopyId !== null
  );

  let reactivated = 0;

  for (const rel of releasedCopies) {
    let activatedReservationId: string | null = null;
    let activatedStudentId: string | null     = null;

    await prisma.$transaction(async (tx) => {
      const result = await tryAutoAssign(rel.catalogueId, rel.allocatedCopyId, schoolId, tx);

      if (!result.activated) {
        // No next patron — release copy to general availability
        await tx.libraryCopy.update({
          where: { id: rel.allocatedCopyId },
          data:  { status: "AVAILABLE" },
        });
      } else if (result.reservation) {
        reactivated++;
        activatedReservationId = result.reservation.id;
        activatedStudentId     = result.reservation.studentId;
      }
    });

    // Emit SSE for the newly activated reservation (outside transaction)
    if (activatedReservationId) {
      // Fetch catalogue title and student name for the SSE payload
      const [catalogue, student] = await Promise.all([
        prisma.libraryCatalogue.findUnique({
          where: { id: rel.catalogueId }, select: { title: true },
        }),
        activatedStudentId
          ? prisma.student.findUnique({
              where: { id: activatedStudentId }, select: { fullName: true },
            })
          : Promise.resolve(null),
      ]);

      emitSSE(schoolId, "libraryReservation.activated", {
        reservationId: activatedReservationId,
        studentId:     activatedStudentId,
        catalogueId:   rel.catalogueId,
        copyId:        rel.allocatedCopyId,
        title:         catalogue?.title ?? "",
        studentName:   student?.fullName ?? null,
      });
    }
  }

  return NextResponse.json({ expired: expired.length, reactivated });
}
