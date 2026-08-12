import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin }          from "@/lib/super-admin";

/** GET /api/super-admin/health — all service health cards + incidents + metrics */
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [services, incidents, metrics, systemStatus] = await Promise.all([
    prisma.serviceHealth.findMany({ orderBy: { serviceName: "asc" } }),
    prisma.incidentLog.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.metricSnapshot.findMany({
      where:   { recordedAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { recordedAt: "asc" },
      select:  { serviceName: true, responseTimeMs: true, errorRate: true, requestCount: true, recordedAt: true },
    }),
    prisma.systemStatus.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({ services, incidents, metrics, systemStatus });
}

const IncidentSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  serviceName: z.string().optional(),
});

/** POST /api/super-admin/health/incident — manually create an incident */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = IncidentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const incident = await prisma.incidentLog.create({
    data: { ...parsed.data, createdBy: user.id },
  });

  return NextResponse.json({ incident }, { status: 201 });
}

/** PATCH /api/super-admin/health — update system status banner */
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status, message } = await req.json();

  // Upsert: delete old row and insert new (SystemStatus has no unique constraint to upsert on)
  const existing = await prisma.systemStatus.findFirst({ orderBy: { createdAt: "desc" } });
  const updated = existing
    ? await prisma.systemStatus.update({ where: { id: existing.id }, data: { status, message, updatedBy: user.id } })
    : await prisma.systemStatus.create({ data: { status, message, updatedBy: user.id } });

  return NextResponse.json({ systemStatus: updated });
}
