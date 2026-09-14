import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { DEFAULT_AI_CONFIG, resolveModelId, type AiConfig } from "@/lib/soma-ai/config";

// ---------------------------------------------------------------------------
// GET /api/soma-ai/config
// Returns the AI configuration (model, params, usage stats) for this school.
// Key preview only â€” never the raw key.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
  });

  if (!row) {
    return NextResponse.json({
      configured: false,
      keyPreview: null,
      isActive: false,
      config: DEFAULT_AI_CONFIG,
      usage: { totalRequests: 0, lastUsedAt: null },
    });
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const config: AiConfig = {
    model: resolveModelId(meta.model as string | null),
    temperature: (meta.temperature as number) ?? DEFAULT_AI_CONFIG.temperature,
    maxOutputTokens: (meta.maxOutputTokens as number) ?? DEFAULT_AI_CONFIG.maxOutputTokens,
    enabled: (meta.enabled as boolean) ?? DEFAULT_AI_CONFIG.enabled,
    cacheEnabled: (meta.cacheEnabled as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
    cacheTtlMinutes: (meta.cacheTtlMinutes as number) ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
  };

  return NextResponse.json({
    configured: true,
    keyPreview: row.keyPreview,
    isActive: row.isActive,
    config,
    usage: {
      totalRequests: (meta.totalRequests as number) ?? 0,
      lastUsedAt: (meta.lastUsedAt as string | null) ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/soma-ai/config
// Updates AI generation config fields stored in GEMINI metadata.
// Optionally updates the API key itself if provided.
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  // Behaviour fields only — model is managed by super-admin, not principals
  enabled: z.boolean().optional(),
  cacheEnabled: z.boolean().optional(),
  cacheTtlMinutes: z.number().int().min(1).max(1440).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "No Soma AI key configured for this school yet." },
      { status: 400 }
    );
  }

  const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;

  // Merge only behaviour fields — never overwrite model/temperature/maxOutputTokens
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    ...Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    ),
  };

  await prisma.schoolIntegration.update({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
    data: { metadata: newMeta as Prisma.InputJsonValue },
  });

  // Re-read and return fresh state
  const updated = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
  });
  const meta = (updated?.metadata ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    ok: true,
    keyPreview: updated?.keyPreview ?? null,
    isActive: updated?.isActive ?? false,
    config: {
      model: resolveModelId(meta.model as string | null),
      temperature: (meta.temperature as number) ?? DEFAULT_AI_CONFIG.temperature,
      maxOutputTokens: (meta.maxOutputTokens as number) ?? DEFAULT_AI_CONFIG.maxOutputTokens,
      enabled: (meta.enabled as boolean) ?? DEFAULT_AI_CONFIG.enabled,
      cacheEnabled: (meta.cacheEnabled as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
      cacheTtlMinutes: (meta.cacheTtlMinutes as number) ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
    },
    usage: {
      totalRequests: (meta.totalRequests as number) ?? 0,
      lastUsedAt: (meta.lastUsedAt as string | null) ?? null,
    },
  });
}

