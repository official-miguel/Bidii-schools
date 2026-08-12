import { NextRequest, NextResponse } from "next/server";
import { prisma }                      from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";

/** POST /api/super-admin/imports/[id]/rollback */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await prisma.importJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only completed imports can be rolled back" }, { status: 422 });
  }

  if (job.rollbackAt && new Date() > job.rollbackAt) {
    return NextResponse.json({ error: "Rollback window has expired" }, { status: 422 });
  }

  const updated = await prisma.importJob.update({
    where: { id: params.id },
    data:  { status: "ROLLED_BACK", rolledBackAt: new Date() },
  });

  await logAudit(user.id, "IMPORT_ROLLED_BACK", "school", job.schoolId, { jobId: job.id });

  return NextResponse.json({ job: updated });
}
