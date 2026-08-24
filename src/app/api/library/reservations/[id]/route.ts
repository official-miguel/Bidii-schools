/**
 * GET   /api/library/reservations/[id]  — fetch one reservation
 * PATCH /api/library/reservations/[id]  — update status / notes / expected return
 * DELETE /api/library/reservations/[id] — cancel reservation
 *
 * Cancellation (PATCH status:"CANCELLED" or DELETE):
 *   - When the reservation has an allocatedCopyId, tryAutoAssign is called
 *     inside the transaction to offer the released copy to the next PENDING
 *     INDIVIDUAL patron before falling back to setting the copy AVAILABLE.
 *   - When allocatedCopyId is null, only the reservation status is changed.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";
import { tryAutoAssign } from "@/lib/library/autoAssign";

type Params = { params: { id: string } };

async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
}
async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.libraryReservation.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: { catalogue: true },
  });
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  return NextResponse.json(r);
}

const patchSchema = z.object({
  status:             z.enum(["PENDING","ACTIVE","FULFILLED","CANCELLED","EXPIRED"]).optional(),
  notes:              z.string().trim().optional(),
  expectedReturnDate: z.string().optional().nullable(),
  allocatedCopyId:    z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.libraryReservation.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const d = parsed.data;

  // ── Cancellation with allocated copy → queue reassignment ────────────────
  type ActivatedInfo = {
    id: string;
    studentId: string | null;
    catalogueId: string;
    catalogueTitle?: string;
  };
  let activatedForSSE: ActivatedInfo | null = null;

  if (d.status === "CANCELLED" && r.allocatedCopyId) {
    const catalogue = await prisma.libraryCatalogue.findUnique({
      where: { id: r.catalogueId },
      select: { title: true },
    });

    await prisma.$transaction(async (tx) => {
      // Cancel this reservation first
      await tx.libraryReservation.update({
        where: { id: params.id },
        data:  { status: "CANCELLED" },
      });

      const result = await tryAutoAssign(r.catalogueId, r.allocatedCopyId!, user.schoolId!, tx);

      if (!result.activated) {
        // No waiting patron — release copy to available
        await tx.libraryCopy.update({
          where: { id: r.allocatedCopyId! },
          data:  { status: "AVAILABLE" },
        });
      } else if (result.reservation) {
        activatedForSSE = {
          ...result.reservation,
          catalogueTitle: catalogue?.title ?? "",
        };
      }
    });

    // SSE outside transaction
    let activatedStudentName: string | null = null;
    if (activatedForSSE) {
      const info = activatedForSSE as ActivatedInfo;
      if (info.studentId) {
        const st = await prisma.student.findUnique({
          where:  { id: info.studentId },
          select: { fullName: true },
        });
        activatedStudentName = st?.fullName ?? null;
      }
      emitSSE(user.schoolId!, "libraryReservation.activated", {
        reservationId: info.id,
        studentId:     info.studentId,
        catalogueId:   r.catalogueId,
        copyId:        r.allocatedCopyId,
        title:         info.catalogueTitle ?? "",
        studentName:   activatedStudentName,
      });
    }

    await recordCirculationEvent({
      schoolId:      user.schoolId!,
      eventType:     "RESERVATION_CANCELLED",
      reservationId: params.id,
      catalogueId:   r.catalogueId,
      studentId:     r.studentId,
      performedById: user.id,
      payload: { status: "CANCELLED", allocatedCopyId: r.allocatedCopyId },
    });

    emitSSE(user.schoolId!, "libraryCatalogue.updated", { id: r.catalogueId });

    // Return updated reservation
    const updated = await prisma.libraryReservation.findUnique({ where: { id: params.id } });
    return NextResponse.json(updated);
  }

  // ── Non-cancellation updates (or cancellation with no copy) ──────────────
  const fulfilledAt = d.status === "FULFILLED" ? new Date() : undefined;

  const updated = await prisma.libraryReservation.update({
    where: { id: params.id },
    data: {
      ...(d.status             !== undefined && { status: d.status as never }),
      ...(d.notes              !== undefined && { notes: d.notes }),
      ...(d.expectedReturnDate !== undefined && {
        expectedReturnDate: d.expectedReturnDate ? new Date(d.expectedReturnDate) : null,
      }),
      ...(d.allocatedCopyId    !== undefined && { allocatedCopyId: d.allocatedCopyId }),
      ...(fulfilledAt          !== undefined && { fulfilledAt }),
    },
  });

  await recordCirculationEvent({
    schoolId:      user.schoolId!,
    eventType:     d.status === "CANCELLED" ? "RESERVATION_CANCELLED" : "RESERVED",
    reservationId: params.id,
    catalogueId:   r.catalogueId,
    studentId:     r.studentId,
    performedById: user.id,
    payload: { status: d.status, allocatedCopyId: d.allocatedCopyId },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.updated", { id: r.catalogueId });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.libraryReservation.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  type DeleteActivatedInfo = {
    id: string;
    studentId: string | null;
    catalogueId: string;
    catalogueTitle?: string;
  };
  let activatedForSSE: DeleteActivatedInfo | null = null;

  if (r.allocatedCopyId) {
    const catalogue = await prisma.libraryCatalogue.findUnique({
      where: { id: r.catalogueId },
      select: { title: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.libraryReservation.update({
        where: { id: params.id },
        data:  { status: "CANCELLED" },
      });

      const result = await tryAutoAssign(r.catalogueId, r.allocatedCopyId!, user.schoolId!, tx);

      if (!result.activated) {
        await tx.libraryCopy.update({
          where: { id: r.allocatedCopyId! },
          data:  { status: "AVAILABLE" },
        });
      } else if (result.reservation) {
        activatedForSSE = {
          ...result.reservation,
          catalogueTitle: catalogue?.title ?? "",
        };
      }
    });

    if (activatedForSSE) {
      const info = activatedForSSE as DeleteActivatedInfo;
      let activatedStudentName: string | null = null;
      if (info.studentId) {
        const st = await prisma.student.findUnique({
          where:  { id: info.studentId },
          select: { fullName: true },
        });
        activatedStudentName = st?.fullName ?? null;
      }
      emitSSE(user.schoolId!, "libraryReservation.activated", {
        reservationId: info.id,
        studentId:     info.studentId,
        catalogueId:   r.catalogueId,
        copyId:        r.allocatedCopyId,
        title:         info.catalogueTitle ?? "",
        studentName:   activatedStudentName,
      });
    }
  } else {
    // No allocated copy — just cancel the reservation
    await prisma.libraryReservation.update({
      where: { id: params.id },
      data:  { status: "CANCELLED" },
    });
  }

  emitSSE(user.schoolId!, "libraryCatalogue.updated", { id: r.catalogueId });
  return NextResponse.json({ ok: true });
}
