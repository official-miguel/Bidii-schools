/**
 * GET  /api/library/fines/pause  — list active fine pauses
 * POST /api/library/fines/pause  — create a fine pause
 * DELETE /api/library/fines/pause?id=xxx — deactivate a pause
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { recordFineAudit } from "@/lib/library/circulationEvents";

async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }
async function manageGuard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","manage")); }

export async function GET(_req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pauses = await prisma.libraryFinePause.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(pauses);
}

const createSchema = z.object({
  scope:     z.enum(["SCHOOL_WIDE","STUDENT","EXAM_PERIOD","HOLIDAY","SPECIAL_EVENT"]).default("SCHOOL_WIDE"),
  label:     z.string().trim().min(1),
  reason:    z.string().trim().optional(),
  studentId: z.string().optional(),
  startDate: z.string(),
  endDate:   z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const d = parsed.data;

  if (d.scope === "STUDENT" && !d.studentId)
    return NextResponse.json({ error: "studentId required for STUDENT scope." }, { status: 400 });

  const pause = await prisma.libraryFinePause.create({
    data: {
      schoolId: user.schoolId!,
      scope:      d.scope,
      label:      d.label,
      reason:     d.reason ?? null,
      studentId:  d.studentId ?? null,
      startDate:  new Date(d.startDate),
      endDate:    d.endDate ? new Date(d.endDate) : null,
      createdById: user.id,
    },
  });

  // Record audit event for the school-wide card audit trail
  if (d.scope === "SCHOOL_WIDE") {
    const cards = await prisma.libraryCard.findMany({
      where: { schoolId: user.schoolId!, fineBalance: { gt: 0 } },
      select: { id: true, fineBalance: true },
    });
    for (const c of cards.slice(0, 50)) { // audit up to 50 for performance
      await recordFineAudit({
        schoolId: user.schoolId!, cardId: c.id,
        eventType: "PAUSE_APPLIED", amount: 0, balanceAfter: c.fineBalance,
        reason: d.label, performedById: user.id,
      });
    }
  }

  return NextResponse.json(pause, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const pause = await prisma.libraryFinePause.findFirst({
    where: { id, schoolId: user.schoolId! },
  });
  if (!pause) return NextResponse.json({ error: "Pause not found." }, { status: 404 });

  await prisma.libraryFinePause.update({ where: { id }, data: { isActive: false, endDate: new Date() } });
  return NextResponse.json({ ok: true });
}
