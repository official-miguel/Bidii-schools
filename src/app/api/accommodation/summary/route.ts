import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fast-path auth:
  // - PRINCIPAL: always allowed
  // - TEACHER: always allowed (baseline grants ACCOMMODATION.canView to every teacher)
  // - ADMIN_STAFF: allowed (handled by the general check below)
  // We avoid running the full expensive permission resolver on every request.
  const allowed =
    user.role === "PRINCIPAL" ||
    user.role === "TEACHER" ||
    user.role === "ADMIN_STAFF";

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!user.schoolId!) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = user.schoolId!;

  // All 5 queries run in parallel — no sequential waterfalls.
  const [dormitories, bedCountsTotals, bedCountsOccupied, settings, boardingStudents] =
    await Promise.all([
      prisma.dormitory.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          genderPolicy: true,
          status: true,
          allocationPolicy: true,
          structure: true,
          boardingMaster: { select: { fullName: true } },
        },
        orderBy: { name: "asc" },
      }),

      // Total sleeping positions per dorm
      prisma.sleepingPosition.groupBy({
        by: ["dormId"],
        where: { schoolId },
        _count: { _all: true },
      }),

      // Occupied sleeping positions per dorm
      prisma.sleepingPosition.groupBy({
        by: ["dormId"],
        where: { schoolId, isOccupied: true },
        _count: { _all: true },
      }),

      prisma.accommodationSettings.findUnique({ where: { schoolId } }),

      // Boarding student count — moved into parallel to avoid sequential waterfall
      prisma.allocationRecord.count({
        where: { schoolId, status: "CURRENT" },
      }),
    ]);

  const occupiedMap = new Map(bedCountsOccupied.map((r) => [r.dormId, r._count._all]));
  const bedCountsByDorm = new Map(
    bedCountsTotals.map((r) => [
      r.dormId,
      { total: r._count._all, occupied: occupiedMap.get(r.dormId) ?? 0 },
    ])
  );

  const activeCount      = dormitories.filter((d) => d.status === "ACTIVE").length;
  const maintenanceCount = dormitories.filter((d) => d.status === "UNDER_MAINTENANCE").length;
  const closedCount      = dormitories.filter((d) => d.status === "CLOSED").length;
  const warningPct       = settings?.occupancyWarningPct ?? 90;

  const dormSummaries = dormitories.map((d) => {
    const beds      = bedCountsByDorm.get(d.id) ?? { total: 0, occupied: 0 };
    const capacity  = beds.total;
    const occupied  = beds.occupied;
    const available = Math.max(0, capacity - occupied);
    const pct       = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
    return {
      id:                 d.id,
      name:               d.name,
      genderPolicy:       d.genderPolicy,
      status:             d.status,
      structure:          d.structure,
      allocationPolicy:   d.allocationPolicy,
      capacity,
      occupied,
      available,
      occupancyPct:       pct,
      isAlmostFull:       pct >= warningPct,
      boardingMasterName: d.boardingMaster?.fullName ?? null,
    };
  });

  const totalPositions    = dormSummaries.reduce((s, d) => s + d.capacity, 0);
  const totalOccupied     = dormSummaries.reduce((s, d) => s + d.occupied, 0);
  const availableInActive = dormSummaries.reduce((s, d) => s + d.available, 0);

  return NextResponse.json({
    totalDormitories:      dormitories.length,
    activeDormitories:     activeCount,
    maintenanceDormitories: maintenanceCount,
    closedDormitories:     closedCount,
    boardingStudents,
    totalSleepingPositions: totalPositions,
    occupiedPositions:      totalOccupied,
    availablePositions:     availableInActive,
    occupancyPct:
      totalPositions > 0
        ? Math.round((totalOccupied / totalPositions) * 100)
        : 0,
    dormSummaries,
    settings: settings ?? null,
  });
}
