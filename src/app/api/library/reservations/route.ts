/**
 * GET  /api/library/reservations  — list reservations with filters
 * POST /api/library/reservations  — create INDIVIDUAL / CLASSROOM / DEPARTMENT / WAITLIST
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";

async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
}
async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status      = sp.get("status") ?? undefined;
  const type        = sp.get("type") ?? undefined;
  const catalogueId = sp.get("catalogueId") ?? undefined;
  const studentId   = sp.get("studentId") ?? undefined;
  const take        = Math.min(Number(sp.get("take") ?? "100"), 300);

  const reservations = await prisma.libraryReservation.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(status      ? { status:          status as never }   : {}),
      ...(type        ? { reservationType: type as never }     : {}),
      ...(catalogueId ? { catalogueId }                        : {}),
      ...(studentId   ? { studentId }                          : {}),
    },
    orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }],
    take,
    include: {
      catalogue: { select: { id: true, title: true, bookNumber: true, subject: true, form: true, author: true } },
    },
  });

  return NextResponse.json(reservations);
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

const schema = z.object({
  catalogueId:        z.string().min(1),
  reservationType:    z.enum(["INDIVIDUAL","CLASSROOM","DEPARTMENT","WAITLIST"]).default("INDIVIDUAL"),
  studentId:          z.string().optional(),
  teacherId:          z.string().optional(),
  departmentName:     z.string().trim().optional(),
  quantityRequested:  z.coerce.number().int().min(1).max(500).optional(),
  expectedReturnDate: z.string().optional().nullable(),
  notes:              z.string().trim().optional(),
  expiryDays:         z.coerce.number().int().min(1).max(365).optional(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const d = parsed.data;

  // Validate catalogue
  const catalogue = await prisma.libraryCatalogue.findFirst({
    where: { id: d.catalogueId, schoolId: user.schoolId!, archivedAt: null },
    select: { id: true, title: true },
  });
  if (!catalogue) return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });

  // Validate patron fields
  if (d.reservationType === "INDIVIDUAL" || d.reservationType === "WAITLIST") {
    if (!d.studentId) return NextResponse.json({ error: "studentId is required for individual reservations." }, { status: 400 });
    const student = await prisma.student.findFirst({ where: { id: d.studentId, schoolId: user.schoolId! }, select: { id: true } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (d.reservationType === "CLASSROOM") {
    if (!d.teacherId) return NextResponse.json({ error: "teacherId is required for classroom reservations." }, { status: 400 });
  }
  if (d.reservationType === "DEPARTMENT") {
    if (!d.departmentName?.trim()) return NextResponse.json({ error: "departmentName is required for department reservations." }, { status: 400 });
  }

  // Calculate queue position for WAITLIST
  let queuePosition: number | null = null;
  if (d.reservationType === "WAITLIST") {
    const maxPos = await prisma.libraryReservation.aggregate({
      where: { catalogueId: d.catalogueId, schoolId: user.schoolId!, status: { in: ["PENDING","ACTIVE"] }, reservationType: "WAITLIST" },
      _max: { queuePosition: true },
    });
    queuePosition = (maxPos._max.queuePosition ?? 0) + 1;
  }

  // Try to allocate an available copy immediately (for INDIVIDUAL)
  let allocatedCopyId: string | null = null;
  let initialStatus: "PENDING" | "ACTIVE" = "PENDING";
  if (d.reservationType === "INDIVIDUAL" || d.reservationType === "CLASSROOM") {
    const availableCopy = await prisma.libraryCopy.findFirst({
      where: { catalogueId: d.catalogueId, schoolId: user.schoolId!, status: "AVAILABLE", archivedAt: null },
      select: { id: true },
    });
    if (availableCopy) {
      allocatedCopyId = availableCopy.id;
      initialStatus   = "ACTIVE";
      // Mark copy as reserved
      await prisma.libraryCopy.update({ where: { id: availableCopy.id }, data: { status: "RESERVED" } });
    }
  }

  const expiresAt = d.expiryDays
    ? new Date(Date.now() + d.expiryDays * 86_400_000)
    : null;

  const reservation = await prisma.libraryReservation.create({
    data: {
      schoolId: user.schoolId!,
      catalogueId:        d.catalogueId,
      reservationType:    d.reservationType as never,
      studentId:          d.studentId ?? null,
      teacherId:          d.teacherId ?? null,
      departmentName:     d.departmentName ?? null,
      quantityRequested:  d.quantityRequested ?? 1,
      expectedReturnDate: d.expectedReturnDate ? new Date(d.expectedReturnDate) : null,
      notes:              d.notes ?? null,
      status:             initialStatus as never,
      allocatedCopyId,
      queuePosition,
      expiresAt,
      createdById:        user.id,
    },
    include: {
      catalogue: { select: { id: true, title: true, bookNumber: true } },
    },
  });

  await recordCirculationEvent({
    schoolId: user.schoolId!,
    eventType:     "RESERVED",
    catalogueId:   d.catalogueId,
    copyId:        allocatedCopyId,
    reservationId: reservation.id,
    studentId:     d.studentId ?? null,
    teacherId:     d.teacherId ?? null,
    performedById: user.id,
    payload: { reservationType: d.reservationType, queuePosition, allocatedCopyId },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.updated", { id: d.catalogueId });

  return NextResponse.json(reservation, { status: 201 });
}
