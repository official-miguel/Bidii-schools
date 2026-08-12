/**
 * GET   /api/library/reservations/[id]  — fetch one reservation
 * PATCH /api/library/reservations/[id]  — update status / notes / expected return
 * DELETE /api/library/reservations/[id] — cancel reservation
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";

type Params = { params: { id: string } };
async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }
async function manageGuard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","manage")); }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.libraryReservation.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
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
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const d = parsed.data;

  // If cancelling and a copy was allocated, release it
  if (d.status === "CANCELLED" && r.allocatedCopyId) {
    await prisma.libraryCopy.update({
      where: { id: r.allocatedCopyId },
      data:  { status: "AVAILABLE" },
    });
  }

  // If fulfilling, set fulfilledAt
  const fulfilledAt = d.status === "FULFILLED" ? new Date() : undefined;

  const updated = await prisma.libraryReservation.update({
    where: { id: params.id },
    data: {
      ...(d.status           !== undefined && { status: d.status as never }),
      ...(d.notes            !== undefined && { notes: d.notes }),
      ...(d.expectedReturnDate !== undefined && {
        expectedReturnDate: d.expectedReturnDate ? new Date(d.expectedReturnDate) : null,
      }),
      ...(d.allocatedCopyId  !== undefined && { allocatedCopyId: d.allocatedCopyId }),
      ...(fulfilledAt        !== undefined && { fulfilledAt }),
    },
  });

  await recordCirculationEvent({
    schoolId:      user.schoolId,
    eventType:     d.status === "CANCELLED" ? "RESERVATION_CANCELLED" : "RESERVED",
    reservationId: params.id,
    catalogueId:   r.catalogueId,
    studentId:     r.studentId,
    performedById: user.id,
    payload: { status: d.status, allocatedCopyId: d.allocatedCopyId },
  });

  emitSSE(user.schoolId, "libraryCatalogue.updated", { id: r.catalogueId });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.libraryReservation.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  // Release any allocated copy
  if (r.allocatedCopyId) {
    await prisma.libraryCopy.update({
      where: { id: r.allocatedCopyId }, data: { status: "AVAILABLE" },
    });
  }

  await prisma.libraryReservation.update({
    where: { id: params.id }, data: { status: "CANCELLED" },
  });

  emitSSE(user.schoolId, "libraryCatalogue.updated", { id: r.catalogueId });
  return NextResponse.json({ ok: true });
}
