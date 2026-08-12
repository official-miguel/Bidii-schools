import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const expectations = await prisma.formSubjectExpectation.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { form: "asc" },
  });
  return NextResponse.json(expectations);
}

const setSchema = z.object({
  form: z.number().int().min(1).max(6),
  expectedCount: z.number().int().min(0).max(20),
});

export async function PUT(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = setSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const expectation = await prisma.formSubjectExpectation.upsert({
    where: { schoolId_form: { schoolId: user.schoolId, form: parsed.data.form } },
    update: { expectedCount: parsed.data.expectedCount },
    create: { ...parsed.data, schoolId: user.schoolId },
  });
  return NextResponse.json(expectation);
}
