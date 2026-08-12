import { NextResponse } from "next/server";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function maxAdmissionNumber(schoolId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(CAST("admissionNumber" AS BIGINT)) as max FROM "Student"
    WHERE "schoolId" = ${schoolId} AND "admissionNumber" ~ '^[0-9]+$'`;
  return rows[0]?.max === null || rows[0]?.max === undefined ? null : Number(rows[0].max);
}

export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await maxAdmissionNumber(user.schoolId);
  let next: number | null = null;
  if (current !== null) {
    next = current + 1;
  }
  return NextResponse.json({ nextAdmissionNumber: next });
}