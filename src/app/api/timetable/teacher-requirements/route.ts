/**
 * API Route: /api/timetable/teacher-requirements
 *
 * GET  — returns all active (non-archived) teachers for this school, each
 *         with their current TeacherLoadRequirement row (if one exists).
 * PUT  — upserts a TeacherLoadRequirement for a single teacher.
 *         Passing all-null values for both limit fields is allowed and
 *         means "no constraint" (equivalent to deleting the row, but we keep
 *         the row so we know the user explicitly cleared it).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
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
  } catch (error) {
    console.error("Error fetching teacher requirements:", error);
    return NextResponse.json(
      { error: "Failed to fetch teacher requirements" },
      { status: 500 }
    );
  }
}

// ── PUT ─────────────────────────────────────────────────────────────────────

const putSchema = z.object({
  teacherId:        z.string().min(1),
  minLessonsPerDay: z.number().int().min(0).max(10).nullable(),
  maxLessonsPerDay: z.number().int().min(0).max(10).nullable(),
});

export async function PUT(req: NextRequest) {
  try {
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

    const { teacherId, minLessonsPerDay, maxLessonsPerDay } = parsed.data;

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

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, archivedAt: null },
    });
    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
    }

    const loadReq = await prisma.teacherLoadRequirement.upsert({
      where: { teacherId },
      create: { schoolId, teacherId, minLessonsPerDay, maxLessonsPerDay },
      update: { minLessonsPerDay, maxLessonsPerDay },
    });

    return NextResponse.json({ loadRequirement: loadReq });
  } catch (error) {
    console.error("Error saving teacher requirements:", error);
    return NextResponse.json(
      { error: "Failed to save teacher requirements" },
      { status: 500 }
    );
  }
}
