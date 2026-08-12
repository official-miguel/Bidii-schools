/**
 * API Route: /api/timetable/config
 *
 * Redirects to the new template-based configuration system.
 * The old flat config (periodsPerDay, dayStartTime, etc.) is replaced by:
 *   GET/PUT /api/timetable/template  — template columns + operating days
 *   GET     /api/timetable/v2/config  — full config including special periods
 */

import { NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TimetableSlotType, TimetableSession } from "@prisma/client";
import { generateDefaultTemplate, getTemplateSummary } from "@/lib/timetable/templateManager";


/**
 * GET — returns config in a format compatible with both old and new clients:
 * includes the legacy flat fields (computed from the template) plus the
 * full new template, so both old and new UIs can read from one endpoint.
 */
export async function GET() {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;

  let config = await prisma.timetableConfig.findUnique({
    where: { schoolId },
    include: {
      columns: { orderBy: { position: "asc" } },
    },
  });

  // Create default if missing
  if (!config) {
    const defaultColumns = generateDefaultTemplate();
    config = await prisma.timetableConfig.create({
      data: {
        schoolId,
        operatingDays: [0, 1, 2, 3, 4],
        maxLessonsPerTeacherPerDay: 6,
        columns: {
          create: defaultColumns.map((col) => ({
            position: col.position,
            startTime: col.startTime,
            endTime: col.endTime,
            slotType: col.slotType,
            label: col.label ?? null,
            session: col.session,
          })),
        },
      },
      include: {
        columns: { orderBy: { position: "asc" } },
      },
    });
  }

  const lessonColumns = config.columns.filter((c) => c.slotType === TimetableSlotType.LESSON);

  // Compute legacy fields from template for backward compatibility
  const summary = getTemplateSummary(
    config.columns.map((col) => ({
      position: col.position,
      startTime: col.startTime,
      endTime: col.endTime,
      slotType: col.slotType as TimetableSlotType,
      label: col.label,
      session: col.session as TimetableSession,
    }))
  );

  return NextResponse.json({
    // New template fields
    schoolId: config.schoolId,
    academicYear: config.academicYear,
    term: config.term,
    operatingDays: config.operatingDays,
    maxLessonsPerTeacherPerDay: config.maxLessonsPerTeacherPerDay,
    columns: config.columns,
    summary,
    // Legacy computed fields for backward compatibility
    periodsPerDay: lessonColumns.length,
    dayStartTime: lessonColumns[0]?.startTime ?? "08:00",
    periodDurationMinutes: summary.averagePeriodMinutes || 40,
    updatedAt: config.updatedAt,
  });
}

/**
 * PUT — redirects to new template endpoint with 301.
 * Old code that PUTs to /api/timetable/config should migrate to
 * PUT /api/timetable/template.
 */
export async function PUT() {
  return NextResponse.json(
    {
      error: "This endpoint is read-only. Use PUT /api/timetable/template to update the configuration.",
      migration: "PUT /api/timetable/template",
    },
    { status: 405 }
  );
}
