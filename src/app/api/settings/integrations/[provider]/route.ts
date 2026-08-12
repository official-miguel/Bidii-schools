import { NextRequest, NextResponse } from "next/server";
import type { IntegrationProvider } from "@prisma/client";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { removeSchoolIntegrationKey, listIntegrationStatuses, PROVIDER_INFO } from "@/lib/integrations";

export async function DELETE(_req: NextRequest, { params }: { params: { provider: string } }) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(params.provider in PROVIDER_INFO)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  await removeSchoolIntegrationKey(user.schoolId, params.provider as IntegrationProvider);
  const statuses = await listIntegrationStatuses(user.schoolId);
  return NextResponse.json(statuses);
}
