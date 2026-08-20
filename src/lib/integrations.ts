import type { IntegrationProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret, previewSecret } from "./crypto";

export const PROVIDER_INFO: Record<
  IntegrationProvider,
  { label: string; description: string; keyLabel: string; placeholder: string }
> = {
  GEMINI: {
    label: "Google Gemini",
    description: "Powers AI Timetable, AI TOD Scheduler, and AI School Intelligence.",
    keyLabel: "API key",
    placeholder: "AIza...",
  },
  GOOGLE_CALENDAR: {
    label: "Google Calendar",
    description: "Syncs the school calendar with Google Calendar.",
    keyLabel: "API key",
    placeholder: "AIza...",
  },
  SMS: {
    label: "SMS provider",
    description: "Sends SMS messages from the Communication Centre.",
    keyLabel: "API key / Auth token",
    placeholder: "",
  },
  WHATSAPP: {
    label: "WhatsApp",
    description: "Sends WhatsApp messages to parents who have WhatsApp numbers on file.",
    keyLabel: "API key / Access token",
    placeholder: "",
  },
  EMAIL: {
    label: "Email (SMTP)",
    description: "Sends email from the Communication Centre.",
    keyLabel: "SMTP password / API key",
    placeholder: "",
  },
  MPESA_DARAJA: {
    label: "M-Pesa Daraja",
    description: "Enables M-Pesa STK Push payments and webhook reconciliation for the Finance module.",
    keyLabel: "Consumer secret",
    placeholder: "",
  },
};

export type IntegrationStatus = {
  provider: IntegrationProvider;
  configured: boolean;
  keyPreview: string | null;
  isActive: boolean;
  updatedAt: Date | null;
};

/// Status for every provider, configured or not — the settings page always
/// renders one row per provider in PROVIDER_INFO, never just the ones a
/// school happens to have saved. Never includes the decrypted value.
export async function listIntegrationStatuses(schoolId: string): Promise<IntegrationStatus[]> {
  const rows = await prisma.schoolIntegration.findMany({ where: { schoolId } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return (Object.keys(PROVIDER_INFO) as IntegrationProvider[]).map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      configured: !!row,
      keyPreview: row?.keyPreview ?? null,
      isActive: row?.isActive ?? false,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/// Reads a school's own key for a provider, decrypted, for server-side use
/// only (e.g. the AI service layer calling Gemini on this school's behalf).
/// Never call this from a route that returns the result to the client.
export async function getSchoolIntegrationKey(
  schoolId: string,
  provider: IntegrationProvider
): Promise<{ apiKey: string; metadata: Record<string, unknown> | null } | null> {
  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId, provider } },
  });
  if (!row || !row.isActive) return null;
  return {
    apiKey: decryptSecret(row.encryptedValue),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export async function setSchoolIntegrationKey(
  schoolId: string,
  provider: IntegrationProvider,
  apiKey: string,
  metadata?: Prisma.InputJsonValue | null
) {
  const encryptedValue = encryptSecret(apiKey);
  const keyPreview = previewSecret(apiKey);

  // Prisma JSON columns accept `InputJsonValue | null` (and typically do not like `Record<string, unknown>`
  // when strict types are enabled). Convert/align the type at the boundary.
  const jsonMetadata: Prisma.InputJsonValue | null | undefined = metadata;

  return prisma.schoolIntegration.upsert({
    where: { schoolId_provider: { schoolId, provider } },
    update: {
      encryptedValue,
      keyPreview,
      metadata: jsonMetadata ?? undefined,
      isActive: true,
    },
    create: {
      schoolId,
      provider,
      encryptedValue,
      keyPreview,
      metadata: jsonMetadata ?? undefined,
    },
  });
}

export async function removeSchoolIntegrationKey(schoolId: string, provider: IntegrationProvider) {
  await prisma.schoolIntegration.deleteMany({ where: { schoolId, provider } });
}
