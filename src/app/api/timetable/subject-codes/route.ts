/**
 * API Route: /api/timetable/subject-codes
 *
 * Manages internal subject codes — auto-incrementing integers assigned to
 * subjects in the order they are registered. Never reused even if a subject
 * is removed. Invisible to end users; used by the engine as a stable join key.
 *
 * GET:  List all subjects with their internal codes (sorted by internalCode)
 * POST: Assign the next internal code to a subject that doesn't have one yet
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;

  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    select: {
      id: true,
      internalCode: true,
      code: true,
      name: true,
      type: true,
      createdAt: true,
    },
    orderBy: { internalCode: "asc" },
  });

  return NextResponse.json({
    subjects,
    nextCode: subjects.length > 0
      ? Math.max(...subjects.map((s) => s.internalCode)) + 1
      : 1,
  });
}

const assignSchema = z.object({
  subjectId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;
  const body = assignSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const { subjectId } = body.data;

  // Verify subject belongs to this school
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true, internalCode: true, code: true, name: true },
  });

  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  if (subject.internalCode > 0) {
    return NextResponse.json(
      {
        error: "Subject already has an internal code",
        internalCode: subject.internalCode,
      },
      { status: 409 }
    );
  }

  // Get the next code in a transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Find the current maximum internal code for this school
    const maxResult = await tx.subject.aggregate({
      where: { schoolId },
      _max: { internalCode: true },
    });

    const nextCode = (maxResult._max.internalCode ?? 0) + 1;

    // Assign it atomically
    const updated = await tx.subject.update({
      where: { id: subjectId },
      data: { internalCode: nextCode },
      select: {
        id: true,
        internalCode: true,
        code: true,
        name: true,
      },
    });

    return updated;
  });

  return NextResponse.json({ subject: result }, { status: 201 });
}

/**
 * POST /api/timetable/subject-codes/assign-all
 * Assigns internal codes to all subjects in registration order.
 * Safe to call multiple times — only assigns to subjects missing a code.
 */
export async function PUT(_req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId;

  const assigned = await prisma.$transaction(async (tx) => {
    // Get max existing code
    const maxResult = await tx.subject.aggregate({
      where: { schoolId },
      _max: { internalCode: true },
    });

    let nextCode = (maxResult._max.internalCode ?? 0) + 1;

    // Find all subjects without a code (internalCode === 0 means unassigned)
    const unassigned = await tx.subject.findMany({
      where: { schoolId, internalCode: 0 },
      select: { id: true },
      orderBy: { createdAt: "asc" }, // Registration order
    });

    const updates: Array<{ id: string; internalCode: number }> = [];

    for (const subject of unassigned) {
      await tx.subject.update({
        where: { id: subject.id },
        data: { internalCode: nextCode },
      });
      updates.push({ id: subject.id, internalCode: nextCode });
      nextCode++;
    }

    return updates;
  });

  return NextResponse.json({
    assigned: assigned.length,
    subjects: assigned,
  });
}
