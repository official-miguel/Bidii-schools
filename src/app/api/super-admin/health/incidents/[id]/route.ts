import { NextRequest, NextResponse } from "next/server";
import { prisma }                      from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";

/**
 * PATCH /api/super-admin/health/incidents/[id] — mark an incident resolved.
 *
 * Kept as its own route rather than another action on PATCH /health, which is
 * already the system-status banner. Re-resolving an incident is a no-op so the
 * button stays safe to double-click.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.incidentLog.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  if (existing.resolvedAt) {
    return NextResponse.json({ incident: existing });
  }

  const incident = await prisma.incidentLog.update({
    where: { id: params.id },
    data:  { resolvedAt: new Date() },
  });

  await logAudit(user.id, "INCIDENT_RESOLVED", "incident", incident.id, {
    title: incident.title, serviceName: incident.serviceName, startedAt: incident.startedAt,
  });

  return NextResponse.json({ incident });
}
