/**
 * API Route: /api/timetable/translate-preference
 * 
 * Translates natural language scheduling preferences into structured
 * constraints using pattern matching and optional AI assistance.
 * 
 * POST: Translate one or more preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  translatePreferencePatternBased,
  translatePreferenceWithAI,
  translatePreferencesBatch,
  validateTranslatedPreference,
  type PreferenceInput,
} from "@/lib/timetable/preferenceTranslator";

export async function POST(req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId;
    const body = await req.json();

    const { preferences, useAI } = body;

    if (!Array.isArray(preferences) || preferences.length === 0) {
      return NextResponse.json(
        { error: "preferences array required" },
        { status: 400 }
      );
    }

    // Validate each preference input
    for (const pref of preferences) {
      if (!pref.instruction || typeof pref.instruction !== "string") {
        return NextResponse.json(
          { error: "Each preference must have an instruction string" },
          { status: 400 }
        );
      }
    }

    // Get Gemini API key if AI is requested
    let geminiApiKey: string | undefined;

    if (useAI) {
      const integration = await prisma.schoolIntegration.findUnique({
        where: {
          schoolId_provider: {
            schoolId,
            provider: "GEMINI",
          },
        },
      });

      if (integration?.encryptedValue) {
        // Decrypt the stored API key
        const { decryptSecret } = await import("@/lib/crypto");
        try {
          geminiApiKey = decryptSecret(integration.encryptedValue);
        } catch (error) {
          console.error("Failed to decrypt Gemini API key:", error);
        }
      }

      if (!geminiApiKey) {
        return NextResponse.json(
          {
            error: "AI translation requested but Gemini API key not configured",
            hint: "Configure Gemini API key in Integrations settings or disable AI",
          },
          { status: 400 }
        );
      }
    }

    // Get available subjects for both validation and translation matching
    const subjects = await prisma.subject.findMany({
      where: { schoolId },
      select: { code: true, name: true },
    });

    const availableSubjects = subjects.map((s) => ({
      code: s.code.toUpperCase(),
      name: s.name,
    }));

    // Enrich each preference input with the school's subject list so the
    // translator can match against real codes/names instead of only builtins
    const enrichedPreferences: PreferenceInput[] = preferences.map(
      (p: PreferenceInput) => ({ ...p, availableSubjects })
    );

    // Translate preferences
    let results;

    if (enrichedPreferences.length === 1) {
      // Single preference - immediate response
      const input = enrichedPreferences[0];

      if (useAI && geminiApiKey) {
        const aiResult = await translatePreferenceWithAI(input, geminiApiKey);
        results = [aiResult];
      } else {
        const patternResult = translatePreferencePatternBased(input);
        results = [patternResult];
      }
    } else {
      // Batch translation
      results = await translatePreferencesBatch(
        enrichedPreferences,
        useAI ? geminiApiKey : undefined
      );
    }

    // Validate each result
    const validatedResults = results.map((result) => {
      if (result.success && result.preference) {
        const validation = validateTranslatedPreference(
          result.preference,
          availableSubjects.map((s) => s.code)
        );

        return {
          ...result,
          validation,
        };
      }

      return result;
    });

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      needsClarification: results.filter((r) => r.needsClarification).length,
      highConfidence: results.filter(
        (r) => r.success && r.preference && r.preference.confidence >= 0.8
      ).length,
    };

    return NextResponse.json({
      success: true,
      results: validatedResults,
      summary,
      usedAI: useAI && Boolean(geminiApiKey),
    });
  } catch (error) {
    console.error("Error translating preferences:", error);
    return NextResponse.json(
      { error: "Failed to translate preferences" },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest) {
  try {
    const user =
      (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = user.schoolId;

    // Check if Gemini is configured
    const integration = await prisma.schoolIntegration.findUnique({
      where: {
        schoolId_provider: {
          schoolId,
          provider: "GEMINI",
        },
      },
      select: {
        isActive: true,
        updatedAt: true,
      },
    });

    // Get available subjects
    const subjects = await prisma.subject.findMany({
      where: { schoolId },
      select: {
        code: true,
        name: true,
      },
      orderBy: { code: "asc" },
    });

    // Provide example preferences
    const examples = [
      {
        instruction: "Mathematics should always be in the morning",
        expectedOutput: {
          subjectCode: "MATH",
          session: "MORNING",
          isHard: true,
        },
      },
      {
        instruction: "I prefer English in the afternoon",
        expectedOutput: {
          subjectCode: "ENG",
          session: "AFTERNOON",
          isHard: false,
        },
      },
      {
        instruction: "Physical Education must be after lunch",
        expectedOutput: {
          subjectCode: "PE",
          session: "AFTERNOON",
          isHard: true,
        },
      },
      {
        instruction: "Chemistry practicals need to be in the morning",
        expectedOutput: {
          subjectCode: "CHEM",
          session: "MORNING",
          isHard: true,
        },
      },
    ];

    return NextResponse.json({
      aiAvailable: integration?.isActive || false,
      subjects: subjects.map((s) => ({
        code: s.code,
        name: s.name,
      })),
      examples,
      supportedSessions: ["MORNING", "AFTERNOON", "EVENING"],
      tips: [
        "Be specific about the subject (use subject code or name)",
        "Use 'must' or 'always' for hard constraints, 'prefer' or 'should' for soft preferences",
        "Specify time of day: morning, afternoon, or evening",
        "Examples: 'Math must be in the morning', 'PE should be in the afternoon'",
      ],
    });
  } catch (error) {
    console.error("Error fetching translation info:", error);
    return NextResponse.json(
      { error: "Failed to fetch translation info" },
      { status: 500 }
    );
  }
}
