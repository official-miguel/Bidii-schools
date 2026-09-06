import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getGovernmentDefaultScale,
  resetToDefault,
} from "@/lib/assessment/gradingScale";

// ---------------------------------------------------------------------------
// DELETE /api/assessments/cbe/grading-scale/reset
//
// Deactivates the school's custom scale so they revert to the government
// default.  Principal-only.  The custom rows are soft-deleted (isActive=false)
// rather than hard-deleted so history is preserved.
//
// Response:
//   { ok: true, isCustom: false, bands: GradeBand[] }  ← the default bands
// ---------------------------------------------------------------------------

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await resetToDefault(user.schoolId!);

  const defaultBands = await getGovernmentDefaultScale();

  return NextResponse.json({
    ok:       true,
    isCustom: false,
    bands:    defaultBands.map((b) => ({
      id:               b.id,
      bandName:         b.bandName,
      achievementLevel: b.achievementLevel,
      minPercentage:    b.minPercentage,
      maxPercentage:    b.maxPercentage,
      points:           b.points,
      description:      b.description,
      isActive:         b.isActive,
    })),
  });
}
