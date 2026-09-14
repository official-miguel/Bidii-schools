import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { resolveModelId } from "@/lib/soma-ai/config";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

const TIMEOUT_MS = 12000;

/**
 * POST /api/super-admin/schools/[id]/gemini-key/test
 *
 * Tests the Gemini API key assigned to a school.
 * Does a ListModels call (key validation) then a trivial generateContent
 * call to confirm the model works.
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

  // Read model from stored metadata (or fall back to default)
  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: params.id, provider: "GEMINI" } },
  });
  const meta  = (row?.metadata ?? {}) as Record<string, unknown>;
  const model = resolveModelId(meta.model as string | null);

  const t0 = Date.now();

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Step 1: validate key with ListModels
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(credentials.apiKey)}`,
      { signal: controller.signal }
    );

    if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: "Google rejected this key. Check it is correct and the Gemini API is enabled in the Google Cloud project.",
      });
    }
    if (!listRes.ok) {
      clearTimeout(timeout);
      return NextResponse.json({ ok: false, error: `Google returned HTTP ${listRes.status}. Try again shortly.` });
    }

    // Step 2: test the specific model with a trivial generation call
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(credentials.apiKey)}`,
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

    if (genRes.status === 404) {
      return NextResponse.json({
        ok: false,
        error: `Model "${model}" is not available with this key. Update the model selection above and save, then test again.`,
        latencyMs,
      });
    }
    if (!genRes.ok) {
      return NextResponse.json({ ok: false, error: `Model test returned HTTP ${genRes.status}.`, latencyMs });
    }

    return NextResponse.json({ ok: true, model, latencyMs });
  } catch (e) {
    const err = e as { name?: string };
    if (err.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: "Connection timed out (>12 s). Check server network access and try again.",
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
