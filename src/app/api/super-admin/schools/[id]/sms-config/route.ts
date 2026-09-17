/**
 * Per-school SMS provider credentials.
 *
 *   GET    — masked status (never the decrypted key)
 *   POST   — save / replace this school's own SMSMobivas credentials
 *   DELETE — remove them, which stops this school's SMS until new ones are set
 *
 * Each school bills its own Mobivas account, so the key lives on
 * SchoolIntegration(provider: SMS) and is what the Communication Centre
 * dispatches through. It is entirely separate from the platform-level OTP
 * provider under /super-admin/settings, which is only ever used for
 * forgot-password codes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { prisma }                    from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import {
  setSchoolIntegrationKey,
  removeSchoolIntegrationKey,
} from "@/lib/integrations";

type RouteContext = { params: { id: string } };

async function findSchool(id: string) {
  return prisma.school.findUnique({ where: { id }, select: { id: true, name: true } });
}

/** Shape the UI renders — masked, never the raw key. */
async function readStatus(schoolId: string) {
  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId, provider: "SMS" } },
  });

  if (!row) {
    return { configured: false, keyPreview: null, isActive: false, clientId: null, senderId: null, updatedAt: null };
  }

  const meta = (row.metadata ?? {}) as { clientId?: string; senderId?: string };
  return {
    configured: true,
    keyPreview: row.keyPreview,
    isActive:   row.isActive,
    clientId:   meta.clientId ?? null,
    senderId:   meta.senderId ?? null,
    updatedAt:  row.updatedAt,
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await findSchool(params.id);
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  return NextResponse.json({ config: await readStatus(params.id) });
}

const saveSchema = z.object({
  apiKey:   z.string().trim().min(1, "API key is required."),
  clientId: z.string().trim().min(1, "Client ID is required."),
  senderId: z.string().trim().min(1, "Sender ID is required."),
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await findSchool(params.id);
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { apiKey, clientId, senderId } = parsed.data;

  try {
    await setSchoolIntegrationKey(params.id, "SMS", apiKey, { clientId, senderId });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json(
      {
        error: err.message?.includes("INTEGRATION_ENCRYPTION_KEY")
          ? "Server is missing INTEGRATION_ENCRYPTION_KEY env var. Ask your deployment engineer to set it."
          : "Failed to save the credentials. Try again.",
      },
      { status: 500 }
    );
  }

  // The key itself is never logged — only that it changed, and by whom.
  await logAudit(admin.id, "SCHOOL_SMS_CONFIG_SET", "school", params.id, {
    schoolName: school.name,
    clientId,
    senderId,
  });

  return NextResponse.json({ config: await readStatus(params.id) });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await findSchool(params.id);
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const current = await readStatus(params.id);
  if (!current.configured) {
    return NextResponse.json({ error: "No SMS credentials configured for this school." }, { status: 404 });
  }

  await removeSchoolIntegrationKey(params.id, "SMS");

  await logAudit(admin.id, "SCHOOL_SMS_CONFIG_REMOVED", "school", params.id, {
    schoolName: school.name,
  });

  return NextResponse.json({ config: await readStatus(params.id) });
}
