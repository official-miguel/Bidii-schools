import { NextResponse } from "next/server";
import { prisma }           from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

/**
 * GET /api/super-admin/overview
 * Returns all metrics for the Overview dashboard.
 */
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    totalSchools,
    activeSchools,
    onboardingSchools,
    suspendedSchools,
    totalStudents,
    totalStaff,
    recentErrors,
    systemStatus,
    storageAgg,
  ] = await Promise.all([
    prisma.schoolMeta.count(),
    prisma.schoolMeta.count({ where: { status: "ACTIVE" } }),
    prisma.schoolMeta.count({ where: { status: "ONBOARDING" } }),
    prisma.schoolMeta.count({ where: { status: "SUSPENDED" } }),
    prisma.student.count({ where: { archivedAt: null } }),
    prisma.teacher.count({ where: { archivedAt: null } }),
    prisma.systemError.findMany({
      where: { severity: { in: ["CRITICAL", "HIGH"] }, status: { not: "RESOLVED" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, message: true, severity: true, module: true,
        status: true, createdAt: true, occurrences: true,
        school: { select: { name: true } },
      },
    }),
    prisma.systemStatus.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.storageUsage.aggregate({
      _sum: { sizeBytes: true },
    }),
  ]);

  // Total storage quota = sum of all school quotas in SchoolMeta (in GB)
  const quotaAgg = await prisma.schoolMeta.aggregate({ _sum: { storageQuotaGb: true } });
  const totalStorageUsedGb = Number(storageAgg._sum.sizeBytes ?? 0) / (1024 ** 3);
  const totalQuotaGb = quotaAgg._sum.storageQuotaGb ?? 0;

  return NextResponse.json({
    schools: {
      total: totalSchools,
      active: activeSchools,
      onboarding: onboardingSchools,
      suspended: suspendedSchools,
    },
    totalStudents,
    totalStaff,
    recentErrors,
    systemStatus: systemStatus ?? { status: "OPERATIONAL", message: null },
    storage: {
      usedGb: Number(totalStorageUsedGb.toFixed(2)),
      quotaGb: Number(totalQuotaGb.toFixed(2)),
    },
  });
}
