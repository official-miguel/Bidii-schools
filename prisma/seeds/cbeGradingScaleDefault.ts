/**
 * Idempotent upsert of the government-default CBE grading scale rows.
 *
 * The migration 20260906100000_cbe_grading_scale_knec_default seeds these rows
 * directly via SQL (INSERT … ON CONFLICT DO NOTHING), so under normal
 * circumstances you never need to run this file.  It is kept as a runnable
 * fallback for fresh environments provisioned via schema-push rather than
 * full migration replay.
 *
 * Usage:
 *   npx ts-node prisma/seeds/cbeGradingScaleDefault.ts
 */

import { PrismaClient } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient() as any;

/**
 * The government-default KNEC CBE Achievement Level grading bands.
 *
 * Source: KNEC Competency Based Education grading rubric.
 * Eight bands ordered from highest (EE1) to lowest (BE2).
 *
 * NOTE: Do NOT replace these values with the 8-4-4 KCSE letter-grade table
 * from grading844.ts — that is a separate scale used only for 8-4-4 reports.
 */
export const GOVERNMENT_DEFAULT_BANDS = [
  { id: "govt_knec_EE1", bandName: "EE1", achievementLevel: 8, minPercentage: 90, maxPercentage: 100, points: 8, description: "Exceptional"        },
  { id: "govt_knec_EE2", bandName: "EE2", achievementLevel: 7, minPercentage: 75, maxPercentage:  89, points: 7, description: "Very Good"           },
  { id: "govt_knec_ME1", bandName: "ME1", achievementLevel: 6, minPercentage: 58, maxPercentage:  74, points: 6, description: "Good"                },
  { id: "govt_knec_ME2", bandName: "ME2", achievementLevel: 5, minPercentage: 41, maxPercentage:  57, points: 5, description: "Fair"                },
  { id: "govt_knec_AE1", bandName: "AE1", achievementLevel: 4, minPercentage: 31, maxPercentage:  40, points: 4, description: "Needs Improvement"   },
  { id: "govt_knec_AE2", bandName: "AE2", achievementLevel: 3, minPercentage: 21, maxPercentage:  30, points: 3, description: "Below Average"       },
  { id: "govt_knec_BE1", bandName: "BE1", achievementLevel: 2, minPercentage: 11, maxPercentage:  20, points: 2, description: "Well Below Average"  },
  { id: "govt_knec_BE2", bandName: "BE2", achievementLevel: 1, minPercentage:  0, maxPercentage:  10, points: 1, description: "Minimal"             },
] as const;

export async function seedGovernmentDefault() {
  // First ensure no stale KCSE rows remain (they would have been removed by
  // migration 20260906100000, but this guards against schema-push workflows).
  const staleKcseIds = [
    "govt_cbe_A", "govt_cbe_Aminus", "govt_cbe_Bplus", "govt_cbe_B",
    "govt_cbe_Bminus", "govt_cbe_Cplus", "govt_cbe_C", "govt_cbe_Cminus",
    "govt_cbe_Dplus", "govt_cbe_D", "govt_cbe_Dminus", "govt_cbe_E",
  ];
  await prisma.cbeGradingScale.deleteMany({
    where: { id: { in: staleKcseIds } },
  });

  let created = 0;
  let skipped = 0;

  for (const band of GOVERNMENT_DEFAULT_BANDS) {
    const exists = await prisma.cbeGradingScale.findUnique({ where: { id: band.id } });
    if (exists) { skipped++; continue; }
    await prisma.cbeGradingScale.create({
      data: { ...band, schoolId: null, isActive: true },
    });
    created++;
  }

  console.log(`CBE government default scale: ${created} created, ${skipped} already existed.`);
}

// Run directly.
if (require.main === module) {
  seedGovernmentDefault()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
