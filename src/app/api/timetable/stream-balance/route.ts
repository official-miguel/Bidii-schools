/**
 * API Route: /api/timetable/stream-balance
 * 
 * Manages stream population balancing for selective/elective subjects.
 * Ensures no stream becomes significantly larger than another unless
 * manually approved by admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  analyzeStreamBalance,
  suggestStreamAssignments,
  calculateRebalancingMoves,
  type BalancingConfig,
} from "@/lib/timetable/streamBalancer";

export async function GET(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId;
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");

    if (!subjectId) {
      return NextResponse.json(
        { error: "subjectId parameter required" },
        { status: 400 }
      );
    }

    // Get subject details
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    // Get classes that teach this subject (streams)
    const classes = await prisma.schoolClass.findMany({
      where: {
        schoolId,
        subjectTeachers: {
          some: { subjectId },
        },
      },
      select: {
        id: true,
        name: true,
        form: true,
        stream: true,
        students: {
          where: {
            archivedAt: null,
            electives: {
              some: { subjectId },
            },
          },
          select: {
            id: true,
            fullName: true,
            classId: true,
          },
        },
      },
    });

    // Build stream options
    const streamOptions = classes.map((cls) => ({
      classId: cls.id,
      className: cls.name,
      stream: cls.stream || "Main",
      currentCount: cls.students.length,
      capacity: 50, // Default capacity, could be configured per school
    }));

    // Get all students who selected this subject
    const students = classes.flatMap((cls) =>
      cls.students.map((s) => ({
        studentId: s.id,
        name: s.fullName,
        currentClassId: s.classId,
        currentClassName: classes.find((c) => c.id === s.classId)?.name || "",
      }))
    );

    // Analyze balance
    const config: BalancingConfig = {
      maxAbsoluteDifference: 5,
      maxPercentageDifference: 0.2,
      minStreamSize: 10,
      maxStreamSize: 50,
    };

    const analysis = analyzeStreamBalance(subject, streamOptions, students, config);

    return NextResponse.json({
      subject: {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        type: subject.type,
      },
      streams: streamOptions,
      students,
      analysis,
    });
  } catch (error) {
    console.error("Error analyzing stream balance:", error);
    return NextResponse.json(
      { error: "Failed to analyze stream balance" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId;
    const body = await req.json();
    const { action, subjectId } = body;

    if (!subjectId) {
      return NextResponse.json(
        { error: "subjectId required" },
        { status: 400 }
      );
    }

    // Get subject
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    // Action: Get rebalancing suggestions
    if (action === "suggest-rebalance") {
      // Get current assignments
      const students = await prisma.student.findMany({
        where: {
          schoolId,
          archivedAt: null,
          electives: {
            some: { subjectId },
          },
        },
        select: {
          id: true,
          fullName: true,
          classId: true,
          schoolClass: {
            select: { name: true },
          },
        },
      });

      const classes = await prisma.schoolClass.findMany({
        where: {
          schoolId,
          subjectTeachers: {
            some: { subjectId },
          },
        },
        select: {
          id: true,
          name: true,
          stream: true,
          students: {
            where: {
              archivedAt: null,
              electives: {
                some: { subjectId },
              },
            },
            select: { id: true },
          },
        },
      });

      const streamOptions = classes.map((cls) => ({
        classId: cls.id,
        className: cls.name,
        stream: cls.stream || "Main",
        currentCount: cls.students.length,
        capacity: 50,
      }));

      const studentList = students.map((s) => ({
        studentId: s.id,
        name: s.fullName,
        currentClassId: s.classId,
        currentClassName: s.schoolClass.name,
      }));

      const currentAssignments = new Map<string, string>();
      for (const student of students) {
        currentAssignments.set(student.id, student.classId);
      }

      const config: BalancingConfig = {
        maxAbsoluteDifference: 5,
        maxPercentageDifference: 0.2,
        minStreamSize: 10,
        maxStreamSize: 50,
      };

      const moves = calculateRebalancingMoves(
        currentAssignments,
        studentList,
        streamOptions,
        config
      );

      return NextResponse.json({
        success: true,
        moves,
        movesCount: moves.length,
      });
    }

    // Action: Apply rebalancing (with approval)
    if (action === "apply-rebalance") {
      const { moves, approved, notes } = body;

      if (!approved) {
        return NextResponse.json(
          { error: "Rebalancing requires approval" },
          { status: 400 }
        );
      }

      if (!Array.isArray(moves) || moves.length === 0) {
        return NextResponse.json(
          { error: "No moves specified" },
          { status: 400 }
        );
      }

      // Apply moves in transaction
      const result = await prisma.$transaction(async (tx) => {
        const appliedMoves: string[] = [];

        for (const move of moves) {
          // Update student's class
          await tx.student.update({
            where: { id: move.studentId },
            data: { classId: move.toClassId },
          });

          appliedMoves.push(move.studentId);
        }

        // Log the rebalancing action
        await tx.auditLog.create({
          data: {
            schoolId,
            action: "STREAM_REBALANCING",
            detail: {
              subjectId,
              subjectCode: subject.code,
              movesCount: moves.length,
              approvedBy: user.id,
              notes: notes || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              moves: moves.map((m: any) => ({
                studentId: m.studentId,
                studentName: m.studentName,
                from: m.fromClassId,
                to: m.toClassId,
              })),
            },
            performedById: user.id,
          },
        });

        return appliedMoves;
      });

      return NextResponse.json({
        success: true,
        movedStudents: result,
        message: `Successfully moved ${result.length} students`,
      });
    }

    // Action: Auto-assign students to balanced streams
    if (action === "auto-assign") {
      const { studentIds } = body;

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return NextResponse.json(
          { error: "studentIds array required" },
          { status: 400 }
        );
      }

      // Get students
      const students = await prisma.student.findMany({
        where: {
          id: { in: studentIds },
          schoolId,
          archivedAt: null,
        },
        select: {
          id: true,
          fullName: true,
          classId: true,
          schoolClass: {
            select: { name: true },
          },
        },
      });

      // Get available streams
      const classes = await prisma.schoolClass.findMany({
        where: {
          schoolId,
          subjectTeachers: {
            some: { subjectId },
          },
        },
        select: {
          id: true,
          name: true,
          stream: true,
          students: {
            where: {
              archivedAt: null,
              electives: {
                some: { subjectId },
              },
            },
            select: { id: true },
          },
        },
      });

      const streamOptions = classes.map((cls) => ({
        classId: cls.id,
        className: cls.name,
        stream: cls.stream || "Main",
        currentCount: cls.students.length,
        capacity: 50,
      }));

      const studentList = students.map((s) => ({
        studentId: s.id,
        name: s.fullName,
        currentClassId: s.classId,
        currentClassName: s.schoolClass.name,
      }));

      const config: BalancingConfig = {
        maxAbsoluteDifference: 5,
        maxPercentageDifference: 0.2,
        minStreamSize: 10,
        maxStreamSize: 50,
      };

      const assignments = suggestStreamAssignments(studentList, streamOptions, config);

      // Apply assignments in transaction
      const result = await prisma.$transaction(async (tx) => {
        const assigned: Array<{ studentId: string; classId: string }> = [];

        for (const [studentId, classId] of assignments) {
          await tx.student.update({
            where: { id: studentId },
            data: { classId },
          });

          // Add to electives if not already there
          await tx.studentElective.upsert({
            where: {
              studentId_subjectId: {
                studentId,
                subjectId,
              },
            },
            create: {
              studentId,
              subjectId,
            },
            update: {},
          });

          assigned.push({ studentId, classId });
        }

        // Log the action
        await tx.auditLog.create({
          data: {
            schoolId,
            action: "STREAM_AUTO_ASSIGNMENT",
            detail: {
              subjectId,
              subjectCode: subject.code,
              assignedCount: assigned.length,
              performedBy: user.id,
            },
            performedById: user.id,
          },
        });

        return assigned;
      });

      return NextResponse.json({
        success: true,
        assignments: result,
        message: `Successfully assigned ${result.length} students to balanced streams`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in stream balance POST:", error);
    return NextResponse.json(
      { error: "Failed to process stream balance request" },
      { status: 500 }
    );
  }
}
