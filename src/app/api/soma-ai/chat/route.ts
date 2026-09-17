import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { streamGeminiWithTools, AiServiceError } from "@/lib/ai/gemini";
import { resolveUserScope } from "@/lib/soma-ai/permissions";
import { logSomaAIInteraction } from "@/lib/soma-ai/audit";
import { DEFAULT_AI_CONFIG, resolveModelId, type AiConfig } from "@/lib/soma-ai/config";
import { SOMA_TOOL_DECLARATIONS, dispatchTool, pruneToolCache } from "@/lib/soma-ai/tools";
import {
  classifyQuery,
  isNavigationQuestion,
  resolveIntelligenceAnswer,
  resolveDbAnswer,
  type ExtendedCategory,
} from "@/lib/soma-ai/router";
import {
  resolveHelpAnswer,
  formatHelpAnswer,
  formatDisambiguation,
  formatNearMissContext,
  type HelpResolveOutcome,
} from "@/lib/soma-ai/help";
import { formatSystemMapContext } from "@/lib/soma-ai/system-map";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  history: z.array(MessageSchema).max(40).default([]),
  context: z
    .object({
      role: z.string().optional(),
      schoolName: z.string().optional(),
      pagePath: z.string().optional(),
      pageTitle: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(opts: {
  role: string;
  schoolName: string;
  userEmail: string;
  displayName: string;
  studentIds: string[];
  classIds: string[];
  isAdmin: boolean;
  nearMissHelpContext?: string;   // injected when a help query had no confident match
  /** Full role-scoped page map — injected only for navigation/how-to questions. */
  includeSystemMap?: boolean;
}): string {
  const roleDescriptions: Record<string, string> = {
    principal: "a school principal with full access to all school data and operations",
    teacher: "a teacher who manages their assigned classes, enters attendance and marks, and supports student progress",
    staff: "a school staff member with specific module access defined by their staff role",
    parent: "a parent or guardian monitoring their own child's or children's academic progress and school activities",
    student: "a student viewing their own academic records, timetable, and school information",
  };

  const accessContext = opts.isAdmin
    ? "You have full access to all school data."
    : opts.role === "parent"
      ? `You can only see data for ${opts.studentIds.length} linked student(s). Never reference or compare other students.`
      : opts.role === "teacher"
        ? `You teach ${opts.classIds.length} class(es). You can only access data for your assigned classes and students.`
        : opts.role === "student"
          ? "You can only see your own academic records."
          : "Your data access is determined by your staff role permissions.";

  const nearMissSection = opts.nearMissHelpContext
    ? `\n\n${opts.nearMissHelpContext}`
    : "";

  // The page map is sizeable, so it's only attached for questions that are
  // actually about finding your way around — data questions don't need it.
  const systemMapSection = opts.includeSystemMap
    ? `\n\n${formatSystemMapContext(opts.role)}`
    : "";

  return `You are Soma AI, the intelligent assistant embedded in the Bidii School Management System.

You are speaking with **${opts.displayName}** (${opts.userEmail}), who is ${roleDescriptions[opts.role] ?? "a school user"} at **${opts.schoolName}**.

## Privacy and access rules (CRITICAL \u2014 never violate these)
${accessContext}

- NEVER reveal data about students outside this user's scope
- NEVER reveal another person's phone number, email address, or other personal contact details unless this user has admin-level access (Principal or Full Admin Access) and the request is for a legitimate, in-scope administrative purpose. Teachers, parents, and students must never receive another user's phone number or email through you, even their own child's other guardian or a colleague's contact info you might see referenced in data — those are not distributed by Soma AI.
- If asked about restricted data, politely decline without confirming the data exists
- Do not compare students across different families (for parent role)
- For system actions (sending messages, generating reports), always ask for confirmation first

## Answering data questions \u2014 IMPORTANT
You have access to live database tools. **Always call the appropriate tool** when a question requires specific numbers, names, records, or current status. Do NOT say "I don't have access to that data" or tell the user to check the UI manually \u2014 use the tools instead.

Examples of when to call tools:
- "Who is absent today?" \u2192 call getTodayAttendance
- "What are the exam results?" \u2192 call getExamResults
- "How many students do we have?" \u2192 call getStudentCount
- "Which class is performing best?" \u2192 call getClassRankings
- "How full are the dorms?" \u2192 call getDormOccupancy
- "Show me attendance trends" \u2192 call getAttendanceTrends
- "Tell me about [student name]" \u2192 call getStudentProfile

Only answer from your general knowledge when the question is about concepts (CBE/8-4-4 frameworks, grading systems, best practices) or when drafting/writing text.

## Answering "how do I use the system" questions \u2014 CRITICAL
You have two grounded sources below: a **page map** listing every page this user
can open, and (sometimes) **step-by-step guides** for specific tasks.

- Answer navigation questions ("where is X", "how do I get to Y", "what can I do
  in this section") directly from the page map. Name the section and page, and
  quote the path exactly as it appears there.
- When a step-by-step guide is provided for the task, follow its steps rather
  than writing your own.
- When no guide covers the exact task, still help: point the user to the right
  page from the map and describe what they'll do there in general terms, but do
  NOT invent specific button labels or menu item names you haven't been given.
  Say "open <page> and look for the option to \u2026" rather than naming a button
  that may not exist.
- Never name a page or path that isn't in the map. If a feature genuinely isn't
  there, say so plainly instead of guessing.${systemMapSection}${nearMissSection}

## Communication style
- Concise, direct, and professional \u2014 like a trusted expert colleague
- Use markdown: **bold**, tables, numbered steps
- Note when you are presenting live database data
- If uncertain about a specific fact, use a tool rather than guessing

## Context
Today: ${new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Term: ${getCurrentTerm()}
School: ${opts.schoolName}`;
}

function getCurrentTerm(): string {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "Term 1 (Januaryâ€“March)";
  if (m <= 7) return "Term 2 (Aprilâ€“July)";
  return "Term 3 (Augustâ€“November)";
}

// ---------------------------------------------------------------------------
// Usage increment (fire-and-forget)
// ---------------------------------------------------------------------------

function incrementUsage(schoolId: string): void {
  prisma.schoolIntegration
    .findUnique({ where: { schoolId_provider: { schoolId, provider: "GEMINI" } } })
    .then((row) => {
      if (!row) return;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const newMeta: Record<string, unknown> = {
        ...meta,
        totalRequests: ((meta.totalRequests as number) ?? 0) + 1,
        lastUsedAt: new Date().toISOString(),
      };
      return prisma.schoolIntegration.update({
        where: { schoolId_provider: { schoolId, provider: "GEMINI" } },
        data: { metadata: newMeta as Prisma.InputJsonValue },
      });
    })
    .catch(() => {/* non-fatal */});
}

// Prune expired tool cache entries periodically (every 5 minutes)
let _lastPrune = 0;
function maybePruneCache(): void {
  const now = Date.now();
  if (now - _lastPrune > 5 * 60 * 1000) {
    _lastPrune = now;
    pruneToolCache();
  }
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  maybePruneCache();

  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const user = await requireRole("PRINCIPAL", "TEACHER", "ADMIN_STAFF", "PARENT", "STUDENT");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // â”€â”€ Parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // â”€â”€ Resolve permission scope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const scope = await resolveUserScope(user);

  // Display role for system prompt and audit
  const roleMap: Record<string, string> = {
    PRINCIPAL: "principal", TEACHER: "teacher", ADMIN_STAFF: "staff",
    PARENT: "parent", STUDENT: "student",
  };
  const displayRole = parsed.context?.role ?? roleMap[user.role] ?? "staff";

  // -- Help short-circuit (zero Gemini cost) -----------------------------------
  // Runs before the Gemini credential check so how-to questions that resolve
  // confidently never touch the LLM at all.
  let helpOutcomeForAudit: HelpResolveOutcome | undefined;
  let helpEntryIdForAudit: string | undefined;
  let nearMissHelpContext: string | undefined;

  const classification = classifyQuery(parsed.message);
  if (classification.intent === 'help') {
    const helpResult = resolveHelpAnswer(parsed.message, scope);
    helpOutcomeForAudit = helpResult.outcome;

    if (helpResult.outcome === 'confident' && helpResult.entry) {
      helpEntryIdForAudit = helpResult.entry.id;
      const answer = formatHelpAnswer(helpResult.entry);
      logSomaAIInteraction({
        userId: user.id,
        schoolId: user.schoolId!,
        userRole: user.role,
        message: parsed.message,
        intent: 'help',
        module: 'help',
        executionMs: Date.now() - t0,
        outcome: 'success',
        helpOutcome: 'confident',
        helpEntryId: helpResult.entry.id,
      });
      return NextResponse.json({ answer, type: 'help_confident' });
    }

    if (helpResult.outcome === 'disambiguation' && helpResult.candidates) {
      const answer = formatDisambiguation(helpResult.candidates);
      logSomaAIInteraction({
        userId: user.id,
        schoolId: user.schoolId!,
        userRole: user.role,
        message: parsed.message,
        intent: 'help',
        module: 'help',
        executionMs: Date.now() - t0,
        outcome: 'success',
        helpOutcome: 'disambiguation',
      });
      return NextResponse.json({ answer, type: 'help_disambiguation' });
    }

    // no_match: fall through to Gemini but inject near-miss context
    if (helpResult.nearMisses.length > 0) {
      nearMissHelpContext = formatNearMissContext(helpResult.nearMisses);
    }
  }

  // -- Database short-circuit (zero Gemini cost) -------------------------------
  // The router already recognises the common factual questions ("how many
  // students", "who is absent today", "list all classes"). Those are answered
  // straight from the database: no Gemini call, no rate-limit pressure, and a
  // reply in milliseconds rather than seconds. Anything the resolvers can't
  // answer falls through to the Gemini path untouched.
  if (classification.intent === "db" && classification.dbCategory) {
    try {
      const category = classification.dbCategory as ExtendedCategory;
      const answer =
        (await resolveIntelligenceAnswer(category, scope, parsed.message)) ??
        (await resolveDbAnswer(user.schoolId!, classification.dbCategory, parsed.message)).answer;

      if (answer) {
        logSomaAIInteraction({
          userId: user.id,
          schoolId: user.schoolId!,
          userRole: user.role,
          message: parsed.message,
          intent: "db",
          module: classification.dbCategory,
          executionMs: Date.now() - t0,
          outcome: "success",
        });
        return NextResponse.json({ answer, type: "db" });
      }
    } catch (e) {
      // A resolver failure must never break the chat — fall through to Gemini.
      console.error("[soma-ai/chat] DB short-circuit failed, falling back to Gemini:", e);
    }
  }

  // â”€â”€ Check Gemini credentials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const credentials = await getSchoolIntegrationKey(user.schoolId!, "GEMINI");
  if (!credentials) {
    logSomaAIInteraction({
      userId: user.id,
      schoolId: user.schoolId!,
      userRole: user.role,
      message: parsed.message,
      intent: "gemini",
      executionMs: Date.now() - t0,
      outcome: "error",
      errorSummary: "No Gemini key configured",
    });
    return NextResponse.json(
      {
        error: "Soma AI isn't set up for this school yet. Please contact your system administrator.",
        configIssue: true,
      },
      { status: 503 }
    );
  }

  const meta = (credentials.metadata ?? {}) as Record<string, unknown>;
  const aiConfig: AiConfig = {
    model: resolveModelId(meta.model as string | null),
    temperature: (meta.temperature as number) ?? DEFAULT_AI_CONFIG.temperature,
    maxOutputTokens: (meta.maxOutputTokens as number) ?? DEFAULT_AI_CONFIG.maxOutputTokens,
    enabled: (meta.enabled as boolean) ?? DEFAULT_AI_CONFIG.enabled,
    cacheEnabled: (meta.cacheEnabled as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
    cacheTtlMinutes: (meta.cacheTtlMinutes as number) ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
  };

  if (!aiConfig.enabled) {
    return NextResponse.json(
      {
        error: "Soma AI is currently turned off for this school. Please contact your system administrator.",
        configIssue: true,
      },
      { status: 503 }
    );
  }

  // â”€â”€ Build system prompt (no static data snapshot â€” tools handle that) â”€â”€â”€
  const systemInstruction = buildSystemPrompt({
    role: displayRole,
    schoolName: parsed.context?.schoolName ?? "your school",
    userEmail: user.email ?? "",
    displayName: scope.displayName,
    studentIds: scope.studentIds,
    classIds: scope.classIds,
    isAdmin: scope.isAdmin,
    nearMissHelpContext,
    // Attach the page map for help/navigation questions — including ones the
    // curated KB couldn't answer, which is exactly when Soma needs the breadth.
    includeSystemMap: classification.intent === "help" || isNavigationQuestion(parsed.message),
  });

  // â”€â”€ Build conversation contents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const contents: { role: string; parts: { text: string }[] }[] = [
    ...(parsed.context?.pagePath
      ? [
          {
            role: "user",
            parts: [{ text: `[Context: User is on the "${parsed.context.pageTitle || parsed.context.pagePath}" page in Bidii.]` }],
          },
          { role: "model", parts: [{ text: "Understood." }] },
        ]
      : []),
    ...parsed.history
      .filter((m) => !m.content.startsWith("[Context:"))
      .slice(-20)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    { role: "user", parts: [{ text: parsed.message }] },
  ];

  // â”€â”€ Streaming response with tool calling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const encoder = new TextEncoder();
  void encoder; // used implicitly by sseEvent

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let outcome: "success" | "error" = "success";
      let errorSummary: string | undefined;
      const toolsUsed: string[] = [];

      try {
        incrementUsage(user.schoolId!);

        await streamGeminiWithTools({
          schoolId: user.schoolId!,
          contents,
          resolvedApiKey: credentials.apiKey,
          resolvedConfig: aiConfig,
          options: {
            systemInstruction,
            temperature: aiConfig.temperature,
            maxOutputTokens: aiConfig.maxOutputTokens,
            model: aiConfig.model,
            tools: SOMA_TOOL_DECLARATIONS,

            // Tool call handler â€” queries live DB and streams a status hint to the client
            onToolCall: async (call) => {
              toolsUsed.push(call.name);
              // Send a "thinking" event so the UI can show a loading indicator
              controller.enqueue(
                sseEvent({ type: "tool_call", tool: call.name, args: call.args })
              );
              const result = await dispatchTool(call.name, call.args, scope);
              return result;
            },

            onChunk: (chunk) => {
              fullResponse += chunk;
              controller.enqueue(sseEvent({ type: "chunk", text: chunk }));
            },
          },
          signal: req.signal,
        });

        const executionMs = Date.now() - t0;
        controller.enqueue(sseEvent({ type: "done", executionMs, toolsUsed }));
      } catch (e) {
        outcome = "error";
        const msg = e instanceof AiServiceError
          ? e.message
          : "Soma AI encountered an unexpected error. Please try again.";
        const isConfig = e instanceof AiServiceError && e.configIssue;
        errorSummary = msg.slice(0, 200);
        
        // Log the full error details for debugging
        console.error("[soma-ai/chat] Error:", {
          isAiServiceError: e instanceof AiServiceError,
          message: e instanceof Error ? e.message : String(e),
          internalDetail: e instanceof AiServiceError ? e.internalDetail : undefined,
          stack: e instanceof Error ? e.stack : undefined,
        });
        
        // Admins get the raw technical detail inline (HTTP status, Google's
        // error message) so a Principal/Full Admin can self-diagnose a bad
        // model/key without needing server log access. Non-admins never see
        // this — it can reference internal config.
        const adminDetail = scope.isAdmin && e instanceof AiServiceError
          ? e.internalDetail
          : undefined;

        controller.enqueue(sseEvent({ type: "error", error: msg, configIssue: isConfig, adminDetail }));
      } finally {
        logSomaAIInteraction({
          userId: user.id,
          schoolId: user.schoolId!,
          userRole: user.role,
          message: parsed.message,
          intent: "gemini",
          module: toolsUsed.length > 0 ? toolsUsed.join(",") : "gemini",
          executionMs: Date.now() - t0,
          outcome,
          errorSummary,
          helpOutcome: helpOutcomeForAudit,
          helpEntryId: helpEntryIdForAudit,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

