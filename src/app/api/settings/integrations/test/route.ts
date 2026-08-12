import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { getSchoolIntegrationKey } from "@/lib/integrations";

const schema = z.object({ provider: z.literal("GEMINI") });
// Only Gemini has a real connection test today — it's the only provider
// currently wired to a live call anywhere in the app (the AI features).
// The others (Calendar/SMS/WhatsApp/Email) get a real test added alongside
// their own feature, once there's something to actually call.

const TIMEOUT_MS = 8000;

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unsupported provider for testing." }, { status: 400 });
  }

  const key = await getSchoolIntegrationKey(user.schoolId!, "GEMINI");
  if (!key) {
    return NextResponse.json({ error: "No Gemini key saved yet." }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Lightweight ListModels call — confirms the key is valid and has
    // Gemini API access, without spending a generation call or depending on
    // any particular model name still existing.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.apiKey)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { ok: false, error: "Google rejected this key. Double-check it's correct and enabled for the Gemini API." },
        { status: 200 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Google returned an unexpected error (HTTP ${res.status}). Try again shortly.` },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const err = e as { name?: string };
    // Never let a flaky network call or Google-side outage surface as a
    // 500 — the whole point of testing the key is to give the Principal a
    // clear answer, not a crash.
    const timedOut = err?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: timedOut
          ? "Timed out reaching Google. Try again."
          : "Couldn't reach Google to test this key. Check the server's network access and try again.",
      },
      { status: 200 }
    );
  }
}
