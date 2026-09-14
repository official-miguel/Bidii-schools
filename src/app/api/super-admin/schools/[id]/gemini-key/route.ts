import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import {
  setSchoolIntegrationKey,
  getSchoolIntegrationKey,
  removeSchoolIntegrationKey,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { DEFAULT_AI_CONFIG, resolveModelId } from "@/lib/soma-ai/config";

type RouteContext = { params: { id: string } };

// ---------------------------------------------------------------------------
// GET /api/super-admin/schools/[id]/gemini-key
// Returns the current Gemini key status and AI config for a school.
// Never returns the raw key — only the last-4-char preview.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: params.id, provider: "GEMINI" } },
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
  return NextResponse.json({
    configured: true,
    keyPreview: row.keyPreview,
    isActive: row.isActive,
    config: {
      model:           resolveModelId(meta.model as string | null),
      temperature:     (meta.temperature     as number)  ?? DEFAULT_AI_CONFIG.temperature,
      maxOutputTokens: (meta.maxOutputTokens as number)  ?? DEFAULT_AI_CONFIG.maxOutputTokens,
      enabled:         (meta.enabled         as boolean) ?? DEFAULT_AI_CONFIG.enabled,
      cacheEnabled:    (meta.cacheEnabled    as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
      cacheTtlMinutes: (meta.cacheTtlMinutes as number)  ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
    },
    usage: {
      totalRequests: (meta.totalRequests as number) ?? 0,
      lastUsedAt:    (meta.lastUsedAt    as string | null) ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/super-admin/schools/[id]/gemini-key
// Assigns or replaces the Gemini API key for a school.
// Body: { apiKey: string }
// ---------------------------------------------------------------------------
const setSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required."),
});

export async function POST(
  req: NextRequest,
  { params }: RouteContext
) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Confirm the school exists
  const school = await prisma.school.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const parsed = setSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    await setSchoolIntegrationKey(params.id, "GEMINI", parsed.data.apiKey);

    await logAudit(
      admin.id,
      "SCHOOL_GEMINI_KEY_SET",
      "school",
      params.id,
      { schoolName: school.name }
    );

    // Return fresh status
    const row = await prisma.schoolIntegration.findUnique({
      where: { schoolId_provider: { schoolId: params.id, provider: "GEMINI" } },
    });
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      configured: true,
      keyPreview: row?.keyPreview ?? null,
      isActive:   row?.isActive  ?? true,
      config: {
        model:           resolveModelId(meta.model as string | null),
        temperature:     (meta.temperature     as number)  ?? DEFAULT_AI_CONFIG.temperature,
        maxOutputTokens: (meta.maxOutputTokens as number)  ?? DEFAULT_AI_CONFIG.maxOutputTokens,
        enabled:         (meta.enabled         as boolean) ?? DEFAULT_AI_CONFIG.enabled,
        cacheEnabled:    (meta.cacheEnabled    as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
        cacheTtlMinutes: (meta.cacheTtlMinutes as number)  ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
      },
      usage: {
        totalRequests: (meta.totalRequests as number) ?? 0,
        lastUsedAt:    (meta.lastUsedAt    as string | null) ?? null,
      },
    }, { status: 201 });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json(
      {
        error: err.message?.includes("INTEGRATION_ENCRYPTION_KEY")
          ? "Server is missing INTEGRATION_ENCRYPTION_KEY env var. Ask your deployment engineer to set it."
          : "Failed to save the key. Try again.",
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/super-admin/schools/[id]/gemini-key
// Removes the Gemini key for a school, disabling Soma AI for that school.
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await prisma.school.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  // Check the key exists before removing (return 404 if already absent)
  const existing = await getSchoolIntegrationKey(params.id, "GEMINI");
  if (!existing) {
    return NextResponse.json({ error: "No Gemini key configured for this school." }, { status: 404 });
  }

  await removeSchoolIntegrationKey(params.id, "GEMINI");

  await logAudit(
    admin.id,
    "SCHOOL_GEMINI_KEY_REMOVED",
    "school",
    params.id,
    { schoolName: school.name }
  );

  return NextResponse.json({ ok: true, configured: false });
}
