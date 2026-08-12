import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { getKenyaPublicHolidaysForMonth } from "@/lib/kenyaHolidays";
import { emitSSE } from "@/lib/sse";

/// GET is readable by PRINCIPAL and TEACHER unconditionally (neither is
/// governed by the RBAC module table — see src/lib/permissions.ts), and by
/// ADMIN_STAFF only if their role grants CALENDAR view.
async function requireCalendarViewer() {
  return (await requireSchoolRole("PRINCIPAL", "TEACHER")) ?? (await requireSchoolPermission("CALENDAR", "view"));
}

export async function GET(req: NextRequest) {
  const user = await requireCalendarViewer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    year < 1900 ||
    year > 2100
  ) {
    return NextResponse.json({ error: "Invalid year or month." }, { status: 400 });
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const dbEvents = await prisma.calendarEvent.findMany({
    where: { schoolId: user.schoolId!, date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: "asc" },
    include: { createdBy: { select: { id: true, email: true } } },
  });

  const holidays = getKenyaPublicHolidaysForMonth(year, month);

  const events = [
    ...dbEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date.toISOString(),
      type: e.type,
      audience: e.audience,
      openingDate: e.openingDate ? e.openingDate.toISOString() : null,
      closingDate: e.closingDate ? e.closingDate.toISOString() : null,
      source: "SCHOOL" as const,
      createdBy: e.createdBy?.email ?? null,
    })),
    ...holidays.map((h) => ({
      id: h.id,
      title: h.title,
      description: null,
      date: h.date.toISOString(),
      type: "HOLIDAY" as const,
      audience: "EVERYONE" as const,
      openingDate: null,
      closingDate: null,
      source: "KENYA_HOLIDAY" as const,
      createdBy: null,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ year, month, events });
}

const createSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters."),
  description: z.string().trim().optional().or(z.literal("")),
  date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date."),
  type: z.enum(["HOLIDAY", "EXAM", "MEETING", "EVENT", "OTHER"]).default("EVENT"),
  audience: z.enum(["EVERYONE", "STAFF_ONLY", "PARENTS_ONLY"]).default("EVERYONE"),
  openingDate: z.string().optional().or(z.literal("")),
  closingDate: z.string().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CALENDAR", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const data: Prisma.CalendarEventUncheckedCreateInput = {
      schoolId: user.schoolId!,
      title: parsed.data.title,
      description: parsed.data.description || null,
      date: new Date(parsed.data.date),
      type: parsed.data.type,
      audience: parsed.data.audience,
      createdById: user.id,
    };
    if (parsed.data.openingDate) data.openingDate = new Date(parsed.data.openingDate);
    if (parsed.data.closingDate) data.closingDate = new Date(parsed.data.closingDate);

    const event = await prisma.calendarEvent.create({ data });
    emitSSE(user.schoolId!, "calendarEvent.created", {
      ...event,
      date: event.date.toISOString(),
    });
    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't create event." }, { status: 500 });
  }
}
