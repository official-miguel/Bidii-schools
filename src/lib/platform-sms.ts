/**
 * src/lib/platform-sms.ts
 *
 * Manages the single-row PlatformSmsConfig — Miguel's company-wide SMS
 * provider credentials used for ALL outbound SMS (Communication Centre bulk
 * sends and forgot-password OTP).
 *
 * Mirrors the shape of src/lib/integrations.ts but for the platform-level
 * single row rather than per-school keys.
 *
 * SERVER-SIDE ONLY — never import from client components.
 */

import type { Prisma }               from "@prisma/client";
import { prisma }                    from "./prisma";
import { encryptSecret, decryptSecret, previewSecret } from "./crypto";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns the active platform SMS config decrypted, or null if not set.
 * Called by dispatchPlatformSms — never returns the raw value to the client.
 */
export async function getPlatformSmsKey(): Promise<{
  apiKey:   string;
  metadata: Record<string, unknown> | null;
} | null> {
  const row = await prisma.platformSmsConfig.findFirst({
    where:   { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) return null;
  return {
    apiKey:   decryptSecret(row.encryptedValue),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Returns the current config row for display in the Super Admin UI — masked,
 * never the decrypted value.
 */
export async function getPlatformSmsStatus(): Promise<{
  configured:  boolean;
  provider:    string | null;
  keyPreview:  string | null;
  metadata:    Record<string, unknown> | null;
  isActive:    boolean;
  updatedAt:   Date | null;
} | null> {
  const row = await prisma.platformSmsConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!row) {
    return {
      configured: false,
      provider:   null,
      keyPreview: null,
      metadata:   null,
      isActive:   false,
      updatedAt:  null,
    };
  }
  return {
    configured: true,
    provider:   row.provider,
    keyPreview: row.keyPreview,
    metadata:   (row.metadata as Record<string, unknown> | null) ?? null,
    isActive:   row.isActive,
    updatedAt:  row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Write (Super Admin only — callers must call requireSuperAdmin() first)
// ---------------------------------------------------------------------------

/**
 * Upserts the platform SMS config.  If a row already exists it is updated
 * in-place (there must only ever be one active row).
 */
export async function setPlatformSmsKey(
  apiKey:    string,
  metadata?: Prisma.InputJsonValue | null
): Promise<void> {
  const encryptedValue = encryptSecret(apiKey);
  const keyPreview     = previewSecret(apiKey);
  const jsonMetadata: Prisma.InputJsonValue | null | undefined = metadata;

  // Find an existing row to update, or create a fresh one
  const existing = await prisma.platformSmsConfig.findFirst({
    orderBy: { updatedAt: "desc" },
    select:  { id: true },
  });

  if (existing) {
    await prisma.platformSmsConfig.update({
      where: { id: existing.id },
      data: {
        encryptedValue,
        keyPreview,
        metadata: jsonMetadata ?? undefined,
        isActive: true,
      },
    });
  } else {
    await prisma.platformSmsConfig.create({
      data: {
        encryptedValue,
        keyPreview,
        metadata: jsonMetadata ?? undefined,
        isActive: true,
      },
    });
  }
}
