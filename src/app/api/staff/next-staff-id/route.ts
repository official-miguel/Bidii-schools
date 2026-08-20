import { NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function maxStaffId(schoolId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(CAST("staffId" AS BIGINT)) as max FROM "Teacher"
    WHERE "schoolId" = ${schoolId} AND "staffId" ~ '^[0-9]+$'`;
  return rows[0]?.max === null || rows[0]?.max === undefined ? null : Number(rows[0].max);
}

/// Smallest recycled numeric staff ID for this school, or null if none.
async function smallestRecycledId(schoolId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ staffId: string }[]>`
    SELECT "staffId" FROM "RecycledStaffId"
    WHERE "schoolId" = ${schoolId}
      AND "staffId" ~ '^[0-9]+$'
    ORDER BY CAST("staffId" AS BIGINT) ASC
    LIMIT 1`;
  return rows[0]?.staffId ?? null;
}

/// Returns the next staff ID to allocate.
/// Priority:
///   1. The smallest numeric ID in the RecycledStaffId pool (freed by a
///      departing staff member) â€” promotes compact reuse.
///   2. max(existing numeric staffId) + 1 (sequential increment).
///   3. null when no numeric IDs exist yet (caller shows starting-number input).
export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check for a recycled ID first
  const recycled = await smallestRecycledId(user.schoolId!);
  if (recycled !== null) {
    return NextResponse.json({ nextStaffId: recycled, isRecycled: true });
  }

  const current = await maxStaffId(user.schoolId!);
  const next = current !== null ? String(current + 1) : null;
  return NextResponse.json({ nextStaffId: next, isRecycled: false });
}

