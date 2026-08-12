import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "view"))
  );
}

/**
 * GET /api/accommodation/reports
 *
 * Returns structured report data for the Reports page.
 * Query params:
 *   type  — "occupancy" | "vacancy" | "students" | "movement" | "maintenance" | "unallocated" | "boarding_population"
 *   dormId — optional filter
 *   from  — ISO date string start
 *   to    — ISO date string end
 */
export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "occupancy";
  const dormId = searchParams.get("dormId");
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  const dormWhere = {
    schoolId,
    ...(dormId ? { id: dormId } : {}),
  };

  switch (type) {
    // ── Occupancy report ────────────────────────────────────────────────
    case "occupancy": {
      const dorms = await prisma.dormitory.findMany({
        where: dormWhere,
        orderBy: { name: "asc" },
        include: {
          boardingMaster: { select: { fullName: true } },
          permittedForms: true,
          _count: {
            select: {
              allocations: { where: { status: "CURRENT" } },
              sleepingPositions: true,
            },
          },
        },
      });

      const rows = dorms.map((d) => ({
        dormId: d.id,
        dormName: d.name,
        genderPolicy: d.genderPolicy,
        status: d.status,
        structure: d.structure,
        totalCapacity: d.totalCapacity,
        occupied: d._count.allocations,
        available: Math.max(0, d.totalCapacity - d._count.allocations),
        occupancyPct:
          d.totalCapacity > 0
            ? Math.round((d._count.allocations / d.totalCapacity) * 100)
            : 0,
        permittedForms: d.permittedForms.map((f) => f.form),
        boardingMasterName: d.boardingMaster?.fullName ?? null,
        sleepingPositions: d._count.sleepingPositions,
      }));

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Vacancy report ──────────────────────────────────────────────────
    case "vacancy": {
      const dorms = await prisma.dormitory.findMany({
        where: { ...dormWhere, status: "ACTIVE" },
        orderBy: { name: "asc" },
        include: {
          permittedForms: true,
          _count: { select: { allocations: { where: { status: "CURRENT" } } } },
        },
      });

      const rows = dorms
        .map((d) => ({
          dormId: d.id,
          dormName: d.name,
          genderPolicy: d.genderPolicy,
          structure: d.structure,
          totalCapacity: d.totalCapacity,
          occupied: d._count.allocations,
          available: Math.max(0, d.totalCapacity - d._count.allocations),
          permittedForms: d.permittedForms.map((f) => f.form),
        }))
        .filter((r) => r.available > 0);

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Students by dorm ────────────────────────────────────────────────
    case "students": {
      const allocations = await prisma.allocationRecord.findMany({
        where: {
          schoolId,
          status: "CURRENT",
          ...(dormId ? { dormId } : {}),
        },
        orderBy: [{ dorm: { name: "asc" } }, { student: { fullName: "asc" } }],
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              admissionNumber: true,
              parentContact: true,
              schoolClass: { select: { name: true, form: true } },
            },
          },
          dorm: { select: { id: true, name: true } },
          cubicle: { select: { name: true } },
          bed: { select: { label: true } },
          sleepingPosition: { select: { position: true, customLabel: true } },
        },
      });

      const rows = allocations.map((a) => ({
        studentId: a.student.id,
        studentName: a.student.fullName,
        admissionNumber: a.student.admissionNumber,
        className: a.student.schoolClass.name,
        form: a.student.schoolClass.form,
        parentContact: a.student.parentContact,
        dormId: a.dorm.id,
        dormName: a.dorm.name,
        cubicle: a.cubicle?.name ?? null,
        bed: a.bed?.label ?? null,
        position:
          a.sleepingPosition?.position === "UPPER"
            ? "Upper"
            : a.sleepingPosition?.position === "LOWER"
            ? "Lower"
            : a.sleepingPosition?.customLabel ?? null,
        allocationDate: a.allocationDate,
      }));

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Movement history ────────────────────────────────────────────────
    case "movement": {
      const allocations = await prisma.allocationRecord.findMany({
        where: {
          schoolId,
          ...(dormId ? { dormId } : {}),
          ...(from || to
            ? {
                allocationDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { allocationDate: "desc" },
        take: 500,
        include: {
          student: { select: { fullName: true, admissionNumber: true } },
          dorm: { select: { name: true } },
          cubicle: { select: { name: true } },
          allocatedBy: { select: { email: true } },
        },
      });

      const rows = allocations.map((a) => ({
        id: a.id,
        studentName: a.student.fullName,
        admissionNumber: a.student.admissionNumber,
        dormName: a.dorm.name,
        cubicle: a.cubicle?.name ?? null,
        status: a.status,
        allocationDate: a.allocationDate,
        vacatedDate: a.vacatedDate,
        notes: a.notes,
        allocatedBy: a.allocatedBy?.email ?? null,
      }));

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Unallocated students ────────────────────────────────────────────
    case "unallocated": {
      const allocated = await prisma.allocationRecord.findMany({
        where: { schoolId, status: "CURRENT" },
        select: { studentId: true },
      });
      const allocatedIds = new Set(allocated.map((a) => a.studentId));

      const students = await prisma.student.findMany({
        where: { schoolId, archivedAt: null },
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true, form: true } },
        },
        orderBy: [{ schoolClass: { form: "asc" } }, { fullName: "asc" }],
      });

      const rows = students
        .filter((s) => !allocatedIds.has(s.id))
        .map((s) => ({
          studentId: s.id,
          studentName: s.fullName,
          admissionNumber: s.admissionNumber,
          className: s.schoolClass.name,
          form: s.schoolClass.form,
        }));

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Boarding population ─────────────────────────────────────────────
    case "boarding_population": {
      const classes = await prisma.schoolClass.findMany({
        where: { schoolId },
        orderBy: [{ form: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { students: { where: { archivedAt: null } } } },
          students: {
            where: { archivedAt: null },
            select: {
              id: true,
              accommodationAllocations: {
                where: { status: "CURRENT" },
                select: { dormId: true },
                take: 1,
              },
            },
          },
        },
      });

      const rows = classes.map((c) => {
        const total = c._count.students;
        const boarding = c.students.filter(
          (s) => s.accommodationAllocations.length > 0
        ).length;
        return {
          classId: c.id,
          className: c.name,
          form: c.form,
          stream: c.stream,
          totalStudents: total,
          boardingStudents: boarding,
          dayStudents: total - boarding,
          boardingPct: total > 0 ? Math.round((boarding / total) * 100) : 0,
        };
      });

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    // ── Maintenance / status report ─────────────────────────────────────
    case "maintenance": {
      const dorms = await prisma.dormitory.findMany({
        where: dormWhere,
        orderBy: { name: "asc" },
        include: {
          boardingMaster: { select: { fullName: true } },
          _count: { select: { allocations: { where: { status: "CURRENT" } } } },
        },
      });

      const rows = dorms.map((d) => ({
        dormId: d.id,
        dormName: d.name,
        status: d.status,
        genderPolicy: d.genderPolicy,
        structure: d.structure,
        totalCapacity: d.totalCapacity,
        currentOccupancy: d._count.allocations,
        boardingMasterName: d.boardingMaster?.fullName ?? null,
        description: d.description,
        updatedAt: d.updatedAt,
      }));

      return NextResponse.json({ type, rows, generatedAt: new Date() });
    }

    default:
      return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
  }
}
