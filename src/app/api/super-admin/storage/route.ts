import { NextRequest, NextResponse } from "next/server";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin }          from "@/lib/super-admin";

/** GET /api/super-admin/storage — per-school storage table + breakdown */
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const sortBy  = sp.get("sortBy")  ?? "used";
  const sortDir = (sp.get("sortDir") ?? "desc") as "asc" | "desc";

  const schools = await prisma.school.findMany({
    select: {
      id: true, name: true,
      schoolMeta: { select: { storageQuotaGb: true, planTier: true } },
      storageUsages: {
        select: { type: true, sizeBytes: true, recordedAt: true },
        orderBy: { recordedAt: "desc" },
      },
    },
  });

  // Aggregate per school
  const rows = schools.map((s) => {
    const byType: Record<string, bigint> = {};
    // Use the most recent snapshot per type
    const seenTypes = new Set<string>();
    for (const u of s.storageUsages) {
      if (!seenTypes.has(u.type)) {
        byType[u.type] = (byType[u.type] ?? BigInt(0)) + u.sizeBytes;
        seenTypes.add(u.type);
      }
    }
    const totalBytes = Object.values(byType).reduce((a, b) => a + b, BigInt(0));
    const quotaBytes = BigInt(Math.round((s.schoolMeta?.storageQuotaGb ?? 5) * 1024 ** 3));
    const pct        = quotaBytes > 0 ? Number((totalBytes * BigInt(10000)) / quotaBytes) / 100 : 0;

    return {
      schoolId:     s.id,
      schoolName:   s.name,
      planTier:     s.schoolMeta?.planTier ?? "FREE",
      quotaGb:      s.schoolMeta?.storageQuotaGb ?? 5,
      usedBytes:    totalBytes.toString(),
      usedGb:       Number((Number(totalBytes) / 1024 ** 3).toFixed(3)),
      pct:          Number(pct.toFixed(1)),
      byType:       Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, v.toString()])
      ),
    };
  });

  // Sort
  const sorted = rows.sort((a, b) => {
    const aVal = sortBy === "pct" ? a.pct : a.usedGb;
    const bVal = sortBy === "pct" ? b.pct : b.usedGb;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  // System-wide totals
  const totalUsedGb = rows.reduce((acc, r) => acc + r.usedGb, 0);
  const totalQuotaGb = rows.reduce((acc, r) => acc + r.quotaGb, 0);

  return NextResponse.json({ rows: sorted, totalUsedGb: +totalUsedGb.toFixed(2), totalQuotaGb: +totalQuotaGb.toFixed(2) });
}
