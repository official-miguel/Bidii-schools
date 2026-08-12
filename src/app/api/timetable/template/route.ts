/**
 * API Route: /api/timetable/template
 * 
 * Manages timetable template configuration for a school.
 * GET: Retrieve current template
 * PUT: Update template configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  validateTemplate,
  generateDefaultTemplate,
  getTemplateSummary,
  type TemplateColumnInput,
} from "@/lib/timetable/templateManager";
import { TimetableSlotType, TimetableSession } from "@prisma/client";

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;

    // Fetch template config
    let config = await prisma.timetableConfig.findUnique({
      where: { schoolId },
      include: {
        columns: {
          orderBy: { position: "asc" },
        },
      },
    });

    // Create default if doesn't exist
    if (!config) {
      const defaultColumns = generateDefaultTemplate();

      config = await prisma.timetableConfig.create({
        data: {
          schoolId,
          operatingDays: [0, 1, 2, 3, 4], // Mon-Fri
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
          columns: {
            orderBy: { position: "asc" },
          },
        },
      });
    }

    // Calculate summary
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
      config: {
        schoolId: config.schoolId,
        academicYear: config.academicYear,
        term: config.term,
        operatingDays: config.operatingDays,
        maxLessonsPerTeacherPerDay: config.maxLessonsPerTeacherPerDay,
        columns: config.columns,
        updatedAt: config.updatedAt,
      },
      summary,
    });
  } catch (error) {
    console.error("Error fetching timetable template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;
    const body = await req.json();

    const {
      academicYear,
      term,
      operatingDays,
      maxLessonsPerTeacherPerDay,
      columns,
    } = body;

    // Validate input
    if (!Array.isArray(columns)) {
      return NextResponse.json(
        { error: "columns must be an array" },
        { status: 400 }
      );
    }

    if (!Array.isArray(operatingDays)) {
      return NextResponse.json(
        { error: "operatingDays must be an array" },
        { status: 400 }
      );
    }

    // Validate template
    const validation = validateTemplate(
      columns as TemplateColumnInput[],
      operatingDays,
      maxLessonsPerTeacherPerDay
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Template validation failed",
          validationErrors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 }
      );
    }

    // Update or create config
    const config = await prisma.timetableConfig.upsert({
      where: { schoolId },
      create: {
        schoolId,
        academicYear: academicYear ?? null,
        term: term ?? null,
        operatingDays,
        maxLessonsPerTeacherPerDay,
        columns: {
          create: columns.map((col: TemplateColumnInput) => ({
            position: col.position,
            startTime: col.startTime,
            endTime: col.endTime,
            slotType: col.slotType,
            label: col.label ?? null,
            session: col.session,
          })),
        },
      },
      update: {
        academicYear: academicYear ?? null,
        term: term ?? null,
        operatingDays,
        maxLessonsPerTeacherPerDay,
        columns: {
          // Delete existing and recreate
          deleteMany: {},
          create: columns.map((col: TemplateColumnInput) => ({
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
        columns: {
          orderBy: { position: "asc" },
        },
      },
    });

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
      success: true,
      config: {
        schoolId: config.schoolId,
        academicYear: config.academicYear,
        term: config.term,
        operatingDays: config.operatingDays,
        maxLessonsPerTeacherPerDay: config.maxLessonsPerTeacherPerDay,
        columns: config.columns,
        updatedAt: config.updatedAt,
      },
      summary,
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("Error updating timetable template:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}
