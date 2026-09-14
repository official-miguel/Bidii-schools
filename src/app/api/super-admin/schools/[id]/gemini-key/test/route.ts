import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { MODEL_PRIORITY, DEFAULT_MODEL_ID } from "@/lib/soma-ai/config";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type RouteContext = { params: { id: string } };

const TIMEOUT_MS = 15000;

/**
 * POST /api/super-admin/schools/[id]/gemini-key/test
 *
 * Tests the Gemini API key assigned to a school.
 *
 * 1. Calls ListModels to validate the key and get every model this key can access.
 * 2. Walks MODEL_PRIORITY and picks the first model the key supports.
 * 3. Runs a trivial generateContent call to confirm the model actually works.
 * 4. Saves the working model back to the school's stored metadata so every
 *    AI call from that point forward uses a model the key can actually reach.
 *
 * Returns { ok, model?, latencyMs?, error? }
 */
export async function POST(
  _req: NextRequest,
  { params }: RouteContext
) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentials = await getSchoolIntegrationKey(params.id, "GEMINI");
  if (!credentials) {
    return NextResponse.json(
      { ok: false, error: "No active Gemini API key found for this school." },
      { status: 200 }
    );
  }

  const apiKey = credentials.apiKey;
  const t0 = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // ── Step 1: Validate key + fetch available models ──────────────────────
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      { signal: controller.signal }
    );

    if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: "This API key was rejected by Google. Check that it is valid and that the Gemini API is enabled in the Google Cloud project.",
      });
    }
    if (!listRes.ok) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: `Google returned HTTP ${listRes.status}. Try again shortly.`,
      });
    }

    // Parse the list of model names this key can see
    type ListModelsResponse = { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const listData: ListModelsResponse = await listRes.json().catch(() => ({}));
    const availableIds = new Set(
      (listData.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, "")) // strip "models/" prefix
    );

    // ── Step 2: Pick best model from priority list ─────────────────────────
    let selectedModel: string | null = null;
    for (const candidate of MODEL_PRIORITY) {
      if (availableIds.has(candidate)) {
        selectedModel = candidate;
        break;
      }
    }

    // If none of our priority list matched, fall back to the first
    // generateContent-capable model the key returned
    if (!selectedModel) {
      selectedModel = availableIds.values().next().value ?? DEFAULT_MODEL_ID;
    }

    // ── Step 3: Confirm the model with a trivial generate call ─────────────
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with just the word: OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 },
        }),
      }
    );

    clearTimeout(timeout);
    const latencyMs = Date.now() - t0;

    if (!genRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `Model "${selectedModel}" was listed but generateContent returned HTTP ${genRes.status}. Try again.`,
        latencyMs,
      });
    }

    // ── Step 4: Save the working model to stored config ────────────────────
    const row = await prisma.schoolIntegration.findUnique({
      where: { schoolId_provider: { schoolId: params.id, provider: "GEMINI" } },
    });
    if (row) {
      const existingMeta = (row.metadata ?? {}) as Record<string, unknown>;
      await prisma.schoolIntegration.update({
        where: { schoolId_provider: { schoolId: params.id, provider: "GEMINI" } },
        data: {
          metadata: { ...existingMeta, model: selectedModel } as Prisma.InputJsonValue,
        },
      });
    }

    return NextResponse.json({ ok: true, model: selectedModel, latencyMs });

  } catch (e) {
    const err = e as { name?: string };
    if (err.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: "Connection timed out (>15s). Check server network access and try again.",
        latencyMs: Date.now() - t0,
      });
    }
    return NextResponse.json({
      ok: false,
      error: "Unexpected error during connection test.",
      latencyMs: Date.now() - t0,
    });
  }
}
