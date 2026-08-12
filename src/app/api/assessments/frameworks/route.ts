import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canReadPeriods } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// GET /api/assessments/frameworks
// Returns assessment frameworks for the school.
// - Principals receive full details (counts included).
// - Any role that can read periods (teachers, HODs, exam officers, etc.)
//   receives a minimal read-only view: id, type, label, academicYear, isActive.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isPrincipal = user.role === "PRINCIPAL";

  if (!isPrincipal) {
    // Non-principals get a minimal read: enough to resolve which framework
    // to use when populating the dashboard exam-period filter.
    const actor = await resolveAssessmentActor(user, user.schoolId!);
    if (!canReadPeriods(actor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const frameworks = await db.assessmentFramework.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: [{ type: "asc" }, { academicYear: "desc" }],
      select: {
        id: true,
        type: true,
        label: true,
        academicYear: true,
        isActive: true,
      },
    });

    return NextResponse.json({ frameworks });
  }

  // Principal — full details including counts.
  const frameworks = await db.assessmentFramework.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ type: "asc" }, { academicYear: "desc" }],
    select: {
      id: true,
      type: true,
      label: true,
      academicYear: true,
      isActive: true,
      createdAt: true,
      _count: { select: { periods: true, items: true } },
    },
  });

  return NextResponse.json({ frameworks });
}

// ---------------------------------------------------------------------------
// POST /api/assessments/frameworks
// Creates a new assessment framework.
// Body: { type, label, academicYear }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { type, label, academicYear } = body as {
    type?: string;
    label?: string;
    academicYear?: string;
  };

  if (!type || !label || !academicYear) {
    return NextResponse.json(
      { error: "type, label, and academicYear are required" },
      { status: 422 }
    );
  }

  const VALID_TYPES = ["EIGHT_FOUR_FOUR", "CBC", "CBE"];
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid framework type" }, { status: 422 });
  }

  // Check uniqueness constraint: (schoolId, type, academicYear)
  const existing = await db.assessmentFramework.findUnique({
    where: {
      schoolId_type_academicYear: {
        schoolId: user.schoolId!,
        type,
        academicYear,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A ${type} framework for ${academicYear} already exists.` },
      { status: 409 }
    );
  }

  const framework = await db.assessmentFramework.create({
    data: {
      schoolId: user.schoolId!,
      type,
      label: label.trim(),
      academicYear: academicYear.trim(),
      isActive: true,
    },
    select: {
      id: true,
      type: true,
      label: true,
      academicYear: true,
      isActive: true,
      createdAt: true,
      _count: { select: { periods: true, items: true } },
    },
  });

  return NextResponse.json({ framework }, { status: 201 });
}
