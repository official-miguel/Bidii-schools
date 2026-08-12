import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRecordsPermission } from "@/lib/permissions";
import { generateJson } from "@/lib/ai/gemini";

const schema = z.object({ text: z.string().trim().min(4, "Describe what happened first.") });

export type IncidentSuggestion = {
  title: string;
  category: string;
  severity: "MINOR" | "MODERATE" | "SEVERE";
  keywords: string[];
  suggestedAction: string;
  summary: string;
};

/// Turns a teacher's natural description ("Student was found vaping behind
/// the laboratory") into structured suggestions the incident creator can
/// pre-fill. Never blocks saving — the client treats a fallback as "no
/// suggestions" and lets the user type everything manually.
export async function POST(req: NextRequest) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid input." }, { status: 400 });
  }

  const { value, usedFallback } = await generateJson<IncidentSuggestion>(
    user.schoolId!,
    `A teacher described a school discipline incident:\n"${parsed.data.text}"\n\nReturn JSON:\n- title: very short offence label (2-4 words, e.g. "Vaping", "Fighting during games")\n- category: one of "Substance Abuse", "Violence", "Bullying", "Lateness", "Property Damage", "Dishonesty", "Disrespect", "Truancy", "Other"\n- severity: "MINOR", "MODERATE" or "SEVERE"\n- keywords: 2-5 short lowercase keywords\n- suggestedAction: one short suggested disciplinary action sentence\n- summary: ONE very short summary sentence, e.g. "Found vaping."`,
    {
      temperature: 0.2,
      timeoutMs: 15000,
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          severity: { type: "string", enum: ["MINOR", "MODERATE", "SEVERE"] },
          keywords: { type: "array", items: { type: "string" } },
          suggestedAction: { type: "string" },
          summary: { type: "string" },
        },
        required: ["title", "category", "severity", "keywords", "suggestedAction", "summary"],
      },
      fallback: null as unknown as IncidentSuggestion,
    }
  );

  if (usedFallback || !value) return NextResponse.json({ suggestion: null });
  return NextResponse.json({ suggestion: value });
}
