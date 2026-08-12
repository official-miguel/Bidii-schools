import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

const updateSchema = z.object({
  offence: z.string().trim().min(2).optional(),
  description: z.string().trim().optional().or(z.literal("")),
  actionTaken: z.string().trim().optional().or(z.literal("")),
  resolution: z.string().trim().optional().or(z.literal("")),
  dateOfOffence: z.string().min(1).optional(),
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "ESCALATED"]).optional(),
  notes: z.string().trim().optional().or(z.literal("")),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      student: { select: { id: true, fullName: true, admissionNumber: true, schoolClass: { select: { name: true } } } },
      recordedBy: { select: { email: true, role: true, teacher: { select: { fullName: true } } } },
      caseNotes: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { email: true, role: true, teacher: { select: { fullName: true } } } } } },
      events: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { email: true, role: true, teacher: { select: { fullName: true } } } } } },
      files: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const existing = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  const d = parsed.data;
  const eventDetails: string[] = [];
  if (d.status && d.status !== existing.status) eventDetails.push(`Status changed to ${d.status.replace("_", " ")}`);
  if (d.actionTaken !== undefined && d.actionTaken !== (existing.actionTaken || ""))
    eventDetails.push(`Action taken updated`);
  if (d.resolution !== undefined && d.resolution !== (existing.resolution || ""))
    eventDetails.push(`Resolution updated`);

  try {
    const record = await prisma.disciplineRecord.update({
      where: { id: params.id },
      data: {
        ...(d.offence !== undefined ? { offence: d.offence } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.actionTaken !== undefined ? { actionTaken: d.actionTaken || null } : {}),
        ...(d.resolution !== undefined ? { resolution: d.resolution || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
        ...(d.status ? { status: d.status } : {}),
        ...(d.dateOfOffence ? { dateOfOffence: new Date(d.dateOfOffence) } : {}),
        ...(eventDetails.length > 0
          ? {
              events: {
                create: eventDetails.map((detail) => ({
                  type: "UPDATED",
                  detail,
                  createdById: user.id,
                })),
              },
            }
          : {}),
      },
    });
    emitSSE(user.schoolId!, "disciplineRecord.updated", record);
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "Couldn't update the record." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  try {
    await prisma.disciplineRecord.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the record." }, { status: 500 });
  }
}
