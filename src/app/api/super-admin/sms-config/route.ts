/**
 * GET  /api/super-admin/sms-config  — returns masked status (never decrypted key)
 * POST /api/super-admin/sms-config  — upserts platform SMS credentials
 */

import { NextRequest, NextResponse }        from "next/server";
import { z }                                from "zod";
import { requireSuperAdmin, logAudit }      from "@/lib/super-admin";
import { getPlatformSmsStatus, setPlatformSmsKey } from "@/lib/platform-sms";
import type { Prisma }                      from "@prisma/client";

const schema = z.object({
  apiKey:   z.string().min(1, "API key is required."),
  clientId: z.string().min(1, "Client ID is required."),
  senderId: z.string().min(1, "Sender ID is required."),
});

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getPlatformSmsStatus();
  return NextResponse.json({ config: status });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { apiKey, clientId, senderId } = parsed.data;

  const metadata = { clientId, senderId };

  await setPlatformSmsKey(apiKey, metadata as Prisma.InputJsonValue);

  await logAudit(user.id, "PLATFORM_SMS_CONFIG_UPDATED", "platform_sms", undefined, {
    clientId,
    senderId,
  });

  const updated = await getPlatformSmsStatus();
  return NextResponse.json({ config: updated });
}
