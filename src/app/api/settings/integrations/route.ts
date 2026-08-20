import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { IntegrationProvider } from "@prisma/client";
import { requireSchoolRole } from "@/lib/auth";
import { listIntegrationStatuses, setSchoolIntegrationKey, PROVIDER_INFO } from "@/lib/integrations";

const PROVIDERS = Object.keys(PROVIDER_INFO) as [string, ...string[]];

// Managing API keys is Principal-only and deliberately not part of the RBAC
// module system â€” a role that could "manage Settings" would be able to swap
// in its own Gemini/SMS/email credentials and intercept or run up billing
// on the school's account. Keeping this one screen un-delegable avoids that
// class of problem entirely rather than trying to permission it carefully.
export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statuses = await listIntegrationStatuses(user.schoolId!);
  return NextResponse.json(statuses);
}

const saveSchema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().trim().min(1, "Enter an API key."),
  metadata: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  try {
    await setSchoolIntegrationKey(
      user.schoolId!,
      parsed.data.provider as IntegrationProvider,
      parsed.data.apiKey,
      parsed.data.metadata ?? null
    );
    const statuses = await listIntegrationStatuses(user.schoolId!);
    return NextResponse.json(statuses, { status: 201 });
  } catch (e) {
    const err = e as { message?: string };
    // Most likely INTEGRATION_ENCRYPTION_KEY missing from server env â€” a
    // deploy-config problem, not something the Principal can fix by
    // retrying, so say so plainly.
    return NextResponse.json(
      { error: err.message?.includes("INTEGRATION_ENCRYPTION_KEY")
          ? "This server isn't configured to store API keys yet. Ask whoever deployed Bidii to set INTEGRATION_ENCRYPTION_KEY."
          : "Couldn't save this key. Try again." },
      { status: 500 }
    );
  }
}

