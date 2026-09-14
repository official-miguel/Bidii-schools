import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { resolveModelId } from "@/lib/soma-ai/config";

/**
 * POST /api/soma-ai/config/test
 * Sends a lightweight probe to the Soma AI (Gemini) API to verify the stored
 * key is valid. The model is always taken from the stored school config —
 * principals cannot override it.
 *
 * Returns { ok: boolean; model: string; latencyMs: number; error?: string }
 */
export async function POST(_req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
  });

  if (!row || !row.isActive) {
    return NextResponse.json(
      { ok: false, error: "No Soma AI key has been assigned to this school yet. Contact your system administrator." },
      { status: 200 }
    );
  }

  const apiKey = decryptSecret(row.encryptedValue);
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  // Model is always the stored value — principals do not choose the model
  const model = resolveModelId(meta.model as string | null);

  const t0 = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    // Step 1: Validate key with ListModels
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal }
    );

    if (listRes.status === 400 || listRes.status === 401 || listRes.status === 403) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: "Soma AI key validation failed. Please contact your system administrator to check the key.",
      });
    }
    if (!listRes.ok) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: `Soma AI service returned an unexpected error (HTTP ${listRes.status}). Try again shortly.`,
      });
    }

    // Step 2: Confirm the specific model with a trivial generation call
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
        error: `The configured model "${model}" is not available with this key. Contact your system administrator to update the model.`,
        latencyMs,
      });
    }
    if (!genRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `Model test returned HTTP ${genRes.status}.`,
        latencyMs,
      });
    }

    return NextResponse.json({ ok: true, model, latencyMs });
  } catch (e) {
    const err = e as { name?: string };
    if (err.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: "Connection timed out (>12s). Check your network or try again.",
        latencyMs: Date.now() - t0,
      });
    }
    return NextResponse.json({
      ok: false,
      error: "Unexpected error during connection test. Try again.",
      latencyMs: Date.now() - t0,
    });
  }
}

