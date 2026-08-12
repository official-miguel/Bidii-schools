/**
 * API Route: /api/timetable/session-preferences
 * 
 * Manages session preferences for subjects (morning/afternoon/evening).
 * GET: Retrieve session preferences
 * PUT: Update session preferences
 * POST: Get session recommendations
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TimetableSession } from "@prisma/client";
import {
  calculateSessionDistribution,
  recommendSessionAssignments,
  analyzeSessionCapacity,
} from "@/lib/timetable/sessionAllocator";

export async function GET(_req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;

    // Get timetable config
    const config = await prisma.timetableConfig.findUnique({
      where: { schoolId },
      include: {
        preferences: true,
        columns: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Timetable template not configured" },
        { status: 404 }
      );
    }

    // Calculate session distribution
    const distribution = calculateSessionDistribution(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config.columns as any,
      config.operatingDays
    );

    return NextResponse.json({
      preferences: config.preferences.map((p) => ({
        id: p.id,
        instruction: p.instruction,
        subjectCode: p.subjectCode,
        preferredSession: p.preferredSession,
        isHard: p.isHard,
        metadata: p.metadata,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      distribution,
    });
  } catch (error) {
    console.error("Error fetching session preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch session preferences" },
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

    const { preferences } = body;

    if (!Array.isArray(preferences)) {
      return NextResponse.json(
        { error: "preferences must be an array" },
        { status: 400 }
      );
    }

    // Validate preferences
    for (const pref of preferences) {
      if (!pref.subjectCode || !pref.preferredSession) {
        return NextResponse.json(
          { error: "Each preference must have subjectCode and preferredSession" },
          { status: 400 }
        );
      }

      if (
        ![
          TimetableSession.MORNING,
          TimetableSession.AFTERNOON,
          TimetableSession.EVENING,
        ].includes(pref.preferredSession)
      ) {
        return NextResponse.json(
          { error: `Invalid session: ${pref.preferredSession}` },
          { status: 400 }
        );
      }
    }

    // Get config
    const config = await prisma.timetableConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Timetable template not configured" },
        { status: 404 }
      );
    }

    // Update preferences in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing preferences
      await tx.timetablePreference.deleteMany({
        where: { configId: schoolId },
      });

      // Create new preferences
      await tx.timetablePreference.createMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: preferences.map((pref: any) => ({
          configId: schoolId,
          instruction: pref.instruction || `${pref.subjectCode} in ${pref.preferredSession.toLowerCase()}`,
          subjectCode: pref.subjectCode.toUpperCase(),
          preferredSession: pref.preferredSession,
          isHard: pref.isHard ?? false,
          metadata: pref.metadata ?? null,
        })),
      });

      // Fetch created preferences
      const updated = await tx.timetablePreference.findMany({
        where: { configId: schoolId },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      preferences: result,
    });
  } catch (error) {
    console.error("Error updating session preferences:", error);
    return NextResponse.json(
      { error: "Failed to update session preferences" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId!;
    const body = await req.json();
    const { action } = body;

    // Get recommendations
    if (action === "recommend") {
      const config = await prisma.timetableConfig.findUnique({
        where: { schoolId },
        include: {
          preferences: true,
          columns: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!config) {
        return NextResponse.json(
          { error: "Timetable template not configured" },
          { status: 404 }
        );
      }

      // Get all subjects
      const subjects = await prisma.subject.findMany({
        where: { schoolId },
        select: {
          code: true,
          name: true,
          lessonRequirements: {
            select: { lessonsPerWeek: true },
          },
        },
      });

      const distribution = calculateSessionDistribution(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config.columns as any,
        config.operatingDays
      );

      const existingConstraints = config.preferences.map((p) => ({
        subjectCode: p.subjectCode || "",
        subjectName: "",
        requiredSession: p.preferredSession as TimetableSession,
        isHard: p.isHard,
      }));

      const subjectsWithLessons = subjects.map((s) => ({
        code: s.code,
        name: s.name,
        lessonsPerWeek: s.lessonRequirements.length > 0
          ? Math.round(
              s.lessonRequirements.reduce((sum, r) => sum + r.lessonsPerWeek, 0) /
                s.lessonRequirements.length
            )
          : 5,
      }));

      const recommendations = recommendSessionAssignments(
        subjectsWithLessons,
        distribution,
        existingConstraints
      );

      return NextResponse.json({
        recommendations,
        distribution,
      });
    }

    // Analyze capacity
    if (action === "analyze-capacity") {
      const config = await prisma.timetableConfig.findUnique({
        where: { schoolId },
        include: {
          preferences: true,
          columns: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!config) {
        return NextResponse.json(
          { error: "Timetable template not configured" },
          { status: 404 }
        );
      }

      // Get lesson requirements
      const requirements = await prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        include: {
          subject: {
            select: { code: true },
          },
        },
      });

      const distribution = calculateSessionDistribution(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config.columns as any,
        config.operatingDays
      );

      const prefMap = new Map<string, TimetableSession>();
      for (const pref of config.preferences) {
        if (pref.subjectCode && pref.preferredSession) {
          prefMap.set(pref.subjectCode.toUpperCase(), pref.preferredSession as TimetableSession);
        }
      }

      const reqsWithSession = requirements.map((r) => ({
        subjectCode: r.subject.code,
        lessonsPerWeek: r.lessonsPerWeek,
        preferredSession: prefMap.get(r.subject.code.toUpperCase()),
      }));

      const analysis = analyzeSessionCapacity(
        reqsWithSession,
        distribution,
        config.operatingDays
      );

      return NextResponse.json({
        analysis,
        distribution,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in session preferences POST:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
