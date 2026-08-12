import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRecordsPermission } from "@/lib/permissions";
import { generateJson } from "@/lib/ai/gemini";

const schema = z.object({ text: z.string().trim().min(4, "Describe the achievement first.") });

type AchievementSuggestion = {
  title: string;
  category: "SPORTS" | "LEADERSHIP" | "MUSIC_FESTIVAL" | "ACADEMICS" | "INNOVATION" | "OTHER";
  summary: string;
  keywords: string[];
  awardLevel: string;
};

/// Simplifies a natural achievement description ("Represented the school in
/// county football and won") into a title, category, and short summary the
/// achievement creator pre-fills. Fallback = no suggestions, manual entry.
export async function POST(req: NextRequest) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid input." }, { status: 400 });
  }

  const { value, usedFallback } = await generateJson<AchievementSuggestion>(
    user.schoolId!,
    `A teacher described a student achievement:\n"${parsed.data.text}"\n\nReturn JSON:\n- title: short achievement title (3-6 words, e.g. "County Football Champions")\n- category: one of "SPORTS", "LEADERSHIP", "MUSIC_FESTIVAL", "ACADEMICS", "INNOVATION", "OTHER"\n- summary: ONE very short simplified phrase (max ~8 words, e.g. "Won County Football Championship.")\n- keywords: 2-5 short lowercase keywords\n- awardLevel: "School", "Sub-County", "County", "Regional", "National" or "" if unclear`,
    {
      temperature: 0.2,
      timeoutMs: 15000,
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: ["SPORTS", "LEADERSHIP", "MUSIC_FESTIVAL", "ACADEMICS", "INNOVATION", "OTHER"] },
          summary: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          awardLevel: { type: "string" },
        },
        required: ["title", "category", "summary", "keywords", "awardLevel"],
      },
      fallback: null as unknown as AchievementSuggestion,
    }
  );

  if (usedFallback || !value) return NextResponse.json({ suggestion: null });
  return NextResponse.json({ suggestion: value });
}
