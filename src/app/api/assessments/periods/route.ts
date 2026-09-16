import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canReadPeriods } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// GET /api/assessments/periods
// Returns every exam period for the school — periods are shared across
// every framework (8-4-4 and CBE both use the same "Term 3 Opener 2026"),
// so there is nothing left to filter by here. `frameworkId`/`type` query
// params are accepted but ignored, kept only so older callers that still
// pass them don't break.
// ---------------------------------------------------------------------------
export async function GET(_request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canReadPeriods(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const periods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ academicYear: "desc" }, { term: "asc" }, { name: "asc" }],
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
// Creates a new assessment period — shared by every framework at the school
// (e.g. "Term 3 Opener 2026" is the same period whether a class is 8-4-4 or
// CBE). Which grading scale applies is decided per-class, never per-period,
// so this no longer takes a frameworkId at all.
// Principal only.
// Body: { name, academicYear, term?, weight?, maxMarks? }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { name, academicYear, term, weight, maxMarks } = body as {
    name?: string;
    academicYear?: string;
    term?: number | null;
    weight?: number;
    maxMarks?: number | null;
  };

  if (!name || !academicYear) {
    return NextResponse.json(
      { error: "name and academicYear are required" },
      { status: 422 }
    );
  }

  try {
    const period = await db.assessmentPeriod.create({
      data: {
        schoolId: user.schoolId!,
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
      { error: "A period with this name already exists for this year." },
      { status: 409 }
    );
  }
}
