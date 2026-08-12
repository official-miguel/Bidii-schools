import { NextRequest, NextResponse } from "next/server";
import { requireSchoolPermission } from "@/lib/permissions";
import { getProgress } from "@/lib/messaging/batchProgress";

export async function GET(
  _req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const progress = getProgress(params.batchId);
  if (!progress) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }

  return NextResponse.json(progress);
}
