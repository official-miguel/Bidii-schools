/**
 * API Route: /api/timetable/teacher-requirements
 *
 * GET  — returns all active (non-archived) teachers for this school, each
 *         with their current TeacherLoadRequirement row (if one exists).
 * PUT  — upserts a TeacherLoadRequirement for a single teacher.
 *         Passing all-null values for the four limit fields is allowed and
 *         means "no constraint" (equivalent to deleting the row, but we keep
 *         the row so we know the user explicitly cleared it).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { schoolId } = user;

  const teachers = await prisma.teacher.findMany({
    where: { schoolId, archivedAt: null },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      staffId: true,
      designation: true,
      loadRequirement: {
        select: {
          id: true,
          minLessonsPerWeek: true,
          maxLessonsPerWeek: true,
          minLessonsPerDay: true,
          maxLessonsPerDay: true,
        },
      },
    },
  });

  // Also surface the school-wide default so the UI can display it as a hint
  const config = await prisma.timetableConfig.findUnique({
    where: { schoolId },
    select: { maxLessonsPerTeacherPerDay: true },
  });

  return NextResponse.json({
    teachers,
    schoolDefaultMaxPerDay: config?.maxLessonsPerTeacherPerDay ?? null,
  });
}

// ── PUT ─────────────────────────────────────────────────────────────────────

const putSchema = z.object({
  teacherId: z.string().min(1),
  minLessonsPerWeek: z.number().int().min(0).max(40).nullable(),
  maxLessonsPerWeek: z.number().int().min(0).max(40).nullable(),
  minLessonsPerDay:  z.number().int().min(0).max(10).nullable(),
  maxLessonsPerDay:  z.number().int().min(0).max(10).nullable(),
});

export async function PUT(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { schoolId } = user;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { teacherId, minLessonsPerWeek, maxLessonsPerWeek, minLessonsPerDay, maxLessonsPerDay } =
    parsed.data;

  // Validate cross-field: min must not exceed max when both are set
  if (
    minLessonsPerWeek != null &&
    maxLessonsPerWeek != null &&
    minLessonsPerWeek > maxLessonsPerWeek
  ) {
    return NextResponse.json(
      { error: "Minimum lessons/week cannot exceed maximum." },
      { status: 400 }
    );
  }
  if (
    minLessonsPerDay != null &&
    maxLessonsPerDay != null &&
    minLessonsPerDay > maxLessonsPerDay
  ) {
    return NextResponse.json(
      { error: "Minimum lessons/day cannot exceed maximum." },
      { status: 400 }
    );
  }

  // Confirm teacher belongs to this school
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId, archivedAt: null },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  }

  const loadReq = await prisma.teacherLoadRequirement.upsert({
    where: { teacherId },
    create: {
      schoolId,
      teacherId,
      minLessonsPerWeek,
      maxLessonsPerWeek,
      minLessonsPerDay,
      maxLessonsPerDay,
    },
    update: {
      minLessonsPerWeek,
      maxLessonsPerWeek,
      minLessonsPerDay,
      maxLessonsPerDay,
    },
  });

  return NextResponse.json({ loadRequirement: loadReq });
}
