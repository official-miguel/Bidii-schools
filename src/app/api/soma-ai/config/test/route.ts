import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { DEFAULT_AI_CONFIG } from "@/lib/soma-ai/config";

const schema = z.object({
  model: z.string().optional(),
});

/**
 * POST /api/soma-ai/config/test
 * Sends a lightweight probe to the Gemini API to verify the stored key is
 * valid and the chosen model is accessible. Uses the ListModels endpoint
 * (no generation spend) and then a minimal generateContent call to confirm
 * the specific model works.
 *
 * Returns { ok: boolean; model: string; latencyMs: number; error?: string }
 */
export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const requestedModel = parsed.success ? (parsed.data.model ?? null) : null;

  const row = await prisma.schoolIntegration.findUnique({
    where: { schoolId_provider: { schoolId: user.schoolId!, provider: "GEMINI" } },
  });

  if (!row || !row.isActive) {
    return NextResponse.json(
      { ok: false, error: "No active Gemini API key found. Save a key first." },
      { status: 200 }
    );
  }

  const apiKey = decryptSecret(row.encryptedValue);
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const model = requestedModel ?? (meta.model as string) ?? DEFAULT_AI_CONFIG.model;

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
        error: "Google rejected this key. Check that it is correct and that the Gemini API is enabled in your Google Cloud project.",
      });
    }
    if (!listRes.ok) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        error: `Google returned HTTP ${listRes.status}. Try again shortly.`,
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
        error: `Model "${model}" is not available with this key. Try a different model.`,
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
