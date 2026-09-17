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

  const { resolved, skipped } = await resolveRecipients(descriptors, user.schoolId!);

  // Phone numbers are deliberately withheld — the Composer only needs the
  // count and enough per-recipient data to render the preview, and the message
  // detail panel masks numbers for the same reason.
  return NextResponse.json({
    resolved: resolved.map(({ label, groupTokens, context }) => ({ label, groupTokens, context })),
    skipped,
  });
}
