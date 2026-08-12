import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canReadPeriods } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// GET /api/assessments/periods
// Returns all periods for a given framework.
// Query params:
//   frameworkId — if supplied, returns periods for that framework directly.
//   (legacy)     — if omitted, falls back to the active 8-4-4 framework.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canReadPeriods(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const frameworkIdParam = searchParams.get("frameworkId");

  let frameworkId: string | null = frameworkIdParam;

  if (!frameworkId) {
    const fw844 = await db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR", isActive: true },
      select: { id: true },
    });

    const fwAny = fw844 ?? await db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId!, isActive: true },
      orderBy: { academicYear: "desc" },
      select: { id: true },
    });
    frameworkId = fwAny?.id ?? null;
  } else {
    // Verify this framework belongs to the user's school.
    const framework = await db.assessmentFramework.findUnique({
      where: { id: frameworkId },
      select: { id: true, schoolId: true },
    });
    if (!framework || framework.schoolId !== user.schoolId!) {
      return NextResponse.json({ error: "Framework not found" }, { status: 404 });
    }
  }

  if (!frameworkId) {
    return NextResponse.json({ periods: [] });
  }

  const periods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId!, frameworkId },
    orderBy: [{ term: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      academicYear: true,
      term: true,
      isCurrent: true,
      maxMarks: true,
      weight: true,
    },
  });

  return NextResponse.json({ periods });
}

// ---------------------------------------------------------------------------
// POST /api/assessments/periods
// Creates a new assessment period.
// Principal only.
// Body: { frameworkId, name, academicYear, term?, weight?, maxMarks? }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { frameworkId, name, academicYear, term, weight, maxMarks } = body as {
    frameworkId?: string;
    name?: string;
    academicYear?: string;
    term?: number | null;
    weight?: number;
    maxMarks?: number | null;
  };

  if (!frameworkId || !name || !academicYear) {
    return NextResponse.json(
      { error: "frameworkId, name, and academicYear are required" },
      { status: 422 }
    );
  }

  // Verify framework belongs to this school.
  const framework = await db.assessmentFramework.findUnique({
    where: { id: frameworkId },
    select: { id: true, schoolId: true },
  });
  if (!framework || framework.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  }

  try {
    const period = await db.assessmentPeriod.create({
      data: {
        schoolId: user.schoolId!,
        frameworkId,
        name: name.trim(),
        academicYear: academicYear.trim(),
        term: term ?? null,
        weight: weight ?? 1,
        maxMarks: maxMarks ?? null,
        isCurrent: false,
      },
      select: {
        id: true,
        name: true,
        academicYear: true,
        term: true,
        isCurrent: true,
        maxMarks: true,
        weight: true,
      },
    });
    return NextResponse.json({ period }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A period with this name already exists for this framework and year." },
      { status: 409 }
    );
  }
}
