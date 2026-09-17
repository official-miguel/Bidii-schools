/**
 * The OTP SMS provider — platform owner only.
 *
 *   GET  — masked status (never the decrypted key)
 *   POST — save / replace the credentials
 *
 * This single account sends forgot-password codes for every school, because
 * an OTP has to go out before anyone is signed in to a school and is paid
 * for centrally. Schools' own Communication Centre messages do NOT use it —
 * those run on each school's own key, set on that school's SMS tab.
 */

import { NextRequest, NextResponse }        from "next/server";
import { z }                                from "zod";
import { requireSuperAdminOwner, logAudit } from "@/lib/super-admin";
import { getPlatformSmsStatus, setPlatformSmsKey } from "@/lib/platform-sms";
import type { Prisma }                      from "@prisma/client";

const schema = z.object({
  apiKey:   z.string().trim().min(1, "API key is required."),
  clientId: z.string().trim().min(1, "Client ID is required."),
  senderId: z.string().trim().min(1, "Sender ID is required."),
});

export async function GET() {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getPlatformSmsStatus();
  return NextResponse.json({ config: status });
}

export async function POST(req: NextRequest) {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { apiKey, clientId, senderId } = parsed.data;

  await setPlatformSmsKey(apiKey, { clientId, senderId } as Prisma.InputJsonValue);

  // The key itself is never logged — only that it changed, and by whom.
  await logAudit(owner.id, "OTP_SMS_CONFIG_UPDATED", "otp_sms", undefined, {
    clientId,
    senderId,
  });

  return NextResponse.json({ config: await getPlatformSmsStatus() });
}
