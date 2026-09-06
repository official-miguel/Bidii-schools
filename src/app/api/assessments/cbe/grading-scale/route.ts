import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getGovernmentDefaultScale,
  getSchoolCustomScale,
  saveCustomScale,
  validateBands,
  type GradeBand,
} from "@/lib/assessment/gradingScale";

// ---------------------------------------------------------------------------
// Shared band schema
// ---------------------------------------------------------------------------

const bandSchema = z.object({
  bandName:         z.string().min(1, "Band name is required.").max(10),
  achievementLevel: z.number().int().min(1),
  minPercentage:    z.number().min(0).max(100),
  maxPercentage:    z.number().min(0).max(100),
  points:           z.number().int().min(1),
  description:      z.string().max(200).default(""),
});

const upsertSchema = z.object({
  bands: z.array(bandSchema).min(1, "At least one band is required."),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPublic(band: GradeBand) {
  return {
    id:               band.id,
    bandName:         band.bandName,
    achievementLevel: band.achievementLevel,
    minPercentage:    band.minPercentage,
    maxPercentage:    band.maxPercentage,
    points:           band.points,
    description:      band.description,
    isActive:         band.isActive,
  };
}

// ---------------------------------------------------------------------------
// GET /api/assessments/cbe/grading-scale
//
// Returns the currently active scale for the requesting school.
// Response shape:
//   {
//     isCustom: boolean,           // true → school has its own scale
//     bands: GradeBand[],          // ordered highest → lowest (minPct desc)
//     defaultBands: GradeBand[],   // the government default, always included
//                                  // so the UI can show a comparison
//   }
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [custom, defaults] = await Promise.all([
    getSchoolCustomScale(user.schoolId!),
    getGovernmentDefaultScale(),
  ]);

  const isCustom = custom.length > 0;

  return NextResponse.json({
    isCustom,
    bands:        (isCustom ? custom : defaults).map(toPublic),
    defaultBands: defaults.map(toPublic),
  });
}

// ---------------------------------------------------------------------------
// POST /api/assessments/cbe/grading-scale
//
// Save a custom scale for the school (principal only).
// Body: { bands: BandInput[] }
//
// Validates before writing:
//   • No overlapping ranges
//   • No gaps (full 0–100 covered)
//   • min < max, all values in [0,100]
//   • bandName / achievementLevel / points all non-empty/positive
//
// If validation passes, deactivates the school's old custom rows and
// inserts the new set (all isActive = true).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  // Business-rule validation (overlap / gap / range).
  const validationErrors = validateBands(parsed.data.bands);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "Validation failed.", details: validationErrors },
      { status: 422 }
    );
  }

  const saved = await saveCustomScale(user.schoolId!, parsed.data.bands);

  return NextResponse.json({
    ok:       true,
    isCustom: true,
    bands:    saved.map(toPublic),
  });
}
