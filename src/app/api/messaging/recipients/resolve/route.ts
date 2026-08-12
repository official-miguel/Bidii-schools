import { NextRequest, NextResponse } from "next/server";
import { requireSchoolPermission } from "@/lib/permissions";
import { resolveRecipients } from "@/lib/messaging/resolve";
import type { RecipientDescriptor } from "@/lib/messaging/resolve";

export async function GET(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("descriptors");
  if (!raw) return NextResponse.json({ resolved: [], skipped: [] });

  let descriptors: RecipientDescriptor[];
  try {
    descriptors = JSON.parse(raw) as RecipientDescriptor[];
  } catch {
    return NextResponse.json({ error: "Invalid descriptors JSON." }, { status: 400 });
  }

  const result = await resolveRecipients(descriptors, user.schoolId);
  return NextResponse.json(result);
}
