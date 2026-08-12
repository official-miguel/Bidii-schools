import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

const updateSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters.").optional(),
  description: z.string().trim().optional().or(z.literal("")),
  date: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.")
    .optional(),
  type: z.enum(["HOLIDAY", "EXAM", "MEETING", "EVENT", "OTHER"]).optional(),
  audience: z.enum(["EVERYONE", "STAFF_ONLY", "PARENTS_ONLY"]).optional(),
  openingDate: z.string().optional().or(z.literal("")),
  closingDate: z.string().optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CALENDAR", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Kenya public holidays aren't DB rows (see src/lib/kenyaHolidays.ts) so
  // there's nothing to edit — they'd never match a real id lookup below,
  // but this short-circuits with a clearer message.
  if (params.id.startsWith("kenya-")) {
    return NextResponse.json({ error: "Kenya public holidays can't be edited." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    const updateData: Prisma.CalendarEventUncheckedUpdateInput = {
      title: parsed.data.title,
      description:
        parsed.data.description === undefined ? undefined : parsed.data.description || null,
      date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      type: parsed.data.type,
      audience: parsed.data.audience,
    };
    if ("openingDate" in parsed.data) {
      updateData.openingDate = parsed.data.openingDate ? new Date(parsed.data.openingDate) : null;
    }
    if ("closingDate" in parsed.data) {
      updateData.closingDate = parsed.data.closingDate ? new Date(parsed.data.closingDate) : null;
    }

    const event = await prisma.calendarEvent.update({
      where: { id: params.id },
      data: updateData,
    });
    emitSSE(user.schoolId!, "calendarEvent.updated", {
      ...event,
      date: event.date.toISOString(),
    });
    return NextResponse.json(event);
  } catch {
    return NextResponse.json({ error: "Couldn't update event." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CALENDAR", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (params.id.startsWith("kenya-")) {
    return NextResponse.json({ error: "Kenya public holidays can't be deleted." }, { status: 400 });
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    await prisma.calendarEvent.delete({ where: { id: params.id } });
    emitSSE(user.schoolId!, "calendarEvent.deleted", { id: params.id, schoolId: user.schoolId! });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete event." }, { status: 500 });
  }
}
