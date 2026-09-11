import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";

// ---------------------------------------------------------------------------
// GET /api/classes/promotion/preview
//
// Returns a dry-run summary of what a promotion run would do, without writing
// anything. The "Run Promotion" button must be disabled until every class's
// outcome is resolved (no "unresolved" entries remain and no unconfirmed
// skip-stage warnings are outstanding).
// ---------------------------------------------------------------------------

export type PreviewClassOutcome =
  | "promote"          // students will move to promotesTo class
  | "graduate"         // students will be archived as GRADUATION
  | "unresolved"       // neither link nor terminal flag — blocks the run
  | "unconfirmed-skip" // skip-stage warning not yet confirmed — blocks the run

export interface PreviewClassRow {
  classId:          string;
  className:        string;
  stageName:        string | null;
  studentCount:     number;
  outcome:          PreviewClassOutcome;
  targetClassId:    string | null;
  targetClassName:  string | null;
}

export interface PromotionPreview {
  academicYear:       number | null;
  classes:            PreviewClassRow[];
  promotedTotal:      number;
  graduatedTotal:     number;
  unresolvedCount:    number;
  /** True when all classes are fully configured and the run button can be enabled. */
  canRun:             boolean;
  /** True when a promotion was already run this year (double-run guard). */
  alreadyRunThisYear: boolean;
  alreadyRunAt:       string | null;
}

export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = user.schoolId;

  // Load all active (non-archived) classes with their student counts and links.
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      stageName: true,
      frameworkType: true,
      promotesToClassId: true,
      confirmedTerminal: true,
      skipStageConfirmed: true,
      promotesTo: { select: { id: true, name: true } },
      _count: {
        select: { students: { where: { archivedAt: null } } },
      },
    },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });

  // Get current active academic year from Term (for double-run guard).
  const activeTerm = await prisma.term.findFirst({
    where: { schoolId, isActive: true },
    select: { academicYear: true },
    orderBy: { academicYear: "desc" },
  });
  const academicYear = activeTerm?.academicYear ?? null;

  // Check if a promotion was already run this academic year.
  let alreadyRunAt: string | null = null;
  let alreadyRunThisYear = false;
  if (academicYear) {
    const existingRun = await prisma.auditLog.findFirst({
      where: {
        schoolId,
        action: "YEAR_PROMOTION_RUN",
      },
      orderBy: { performedAt: "desc" },
      select: { detail: true, performedAt: true },
    });
    if (existingRun) {
      const detail = existingRun.detail as Record<string, unknown>;
      if (detail.academicYear === academicYear) {
        alreadyRunThisYear = true;
        alreadyRunAt       = existingRun.performedAt.toISOString();
      }
    }
  }

  // Build per-class rows.
  const rows: PreviewClassRow[] = classes.map((cls) => {
    const studentCount = cls._count.students;
    let outcome: PreviewClassOutcome;

    if (cls.promotesToClassId) {
      // Has an explicit link — check for unconfirmed skip warning.
      outcome = cls.skipStageConfirmed === false
        ? "unconfirmed-skip"  // warning raised but not yet acknowledged
        : "promote";
      // If skipStageConfirmed is true, it means the principal confirmed the
      // skip already, so treat as normal promote.
      // Re-derive: only block on unconfirmed-skip when skip was actually detected.
      // We store skipStageConfirmed=true only after the principal confirms, so
      // false here means either no warning needed (no catalog) or not confirmed.
      // The frontend should only show a warning when the skip was detected;
      // here we conservatively treat false + has link as "promote" unless the
      // backend explicitly flagged it. The PATCH handler clears the flag when
      // the link changes — so false here means "needs confirmation".
      // A safer check: if there's no catalog for this framework, skip check is moot.
      // We'll keep it simple: skipStageConfirmed=false + promotesToClassId = promote
      // UNLESS the run endpoint itself re-validates. For preview, we just flag it.
      outcome = cls.skipStageConfirmed
        ? "promote"
        : (cls.promotesToClassId ? "unconfirmed-skip" : "unresolved");
      // Simpler, correct logic:
      if (cls.promotesToClassId) {
        outcome = cls.skipStageConfirmed ? "promote" : "unconfirmed-skip";
      }
    } else if (cls.confirmedTerminal) {
      outcome = "graduate";
    } else {
      outcome = "unresolved";
    }

    return {
      classId:         cls.id,
      className:       cls.name,
      stageName:       cls.stageName,
      studentCount,
      outcome,
      targetClassId:   cls.promotesTo?.id ?? null,
      targetClassName: cls.promotesTo?.name ?? null,
    };
  });

  // Totals.
  const promotedTotal   = rows.filter((r) => r.outcome === "promote").reduce((s, r) => s + r.studentCount, 0);
  const graduatedTotal  = rows.filter((r) => r.outcome === "graduate").reduce((s, r) => s + r.studentCount, 0);
  const unresolvedCount = rows.filter((r) => r.outcome === "unresolved" || r.outcome === "unconfirmed-skip").length;
  const canRun          = unresolvedCount === 0;

  return NextResponse.json({
    academicYear,
    classes: rows,
    promotedTotal,
    graduatedTotal,
    unresolvedCount,
    canRun,
    alreadyRunThisYear,
    alreadyRunAt,
  } satisfies PromotionPreview);
}
