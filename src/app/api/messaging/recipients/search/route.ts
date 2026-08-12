import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q     = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "15")));

  if (!q) return NextResponse.json({ students: [], teachers: [] });

  const [students, teachers] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        fullName: { contains: q, mode: "insensitive" },
      },
      take:    limit,
      select:  { id: true, fullName: true, admissionNumber: true, classId: true, schoolClass: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.teacher.findMany({
      where: {
        schoolId: user.schoolId,
        fullName: { contains: q, mode: "insensitive" },
      },
      take:    limit,
      select:  { id: true, fullName: true, staffId: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return NextResponse.json({ students, teachers });
}
