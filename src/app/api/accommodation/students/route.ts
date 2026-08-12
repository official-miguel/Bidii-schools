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
 * GET /api/accommodation/students
 * Returns students with optional search, with their current accommodation status.
 * Used by the allocation search picker.
 */
export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const boardingOnly = req.nextUrl.searchParams.get("boardingOnly") === "true";
  const unallocatedOnly = req.nextUrl.searchParams.get("unallocatedOnly") === "true";

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { admissionNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      schoolClass: { select: { name: true, form: true } },
      accommodationAllocations: {
        where: { status: "CURRENT" },
        select: {
          id: true,
          dormId: true,
          dorm: { select: { name: true } },
          cubicle: { select: { name: true } },
          bed: { select: { label: true, bedType: true } },
          sleepingPosition: { select: { position: true, customLabel: true } },
          allocationDate: true,
        },
        take: 1,
      },
    },
    orderBy: { fullName: "asc" },
    take: 50,
  });

  const result = students
    .filter((s) => {
      const hasAllocation = s.accommodationAllocations.length > 0;
      if (boardingOnly && !hasAllocation) return false;
      if (unallocatedOnly && hasAllocation) return false;
      return true;
    })
    .map((s) => ({
      id: s.id,
      fullName: s.fullName,
      admissionNumber: s.admissionNumber,
      className: s.schoolClass.name,
      form: s.schoolClass.form,
      currentAllocation: s.accommodationAllocations[0] ?? null,
    }));

  return NextResponse.json(result);
}
