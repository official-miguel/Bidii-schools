import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { streamGeminiWithTools, callGeminiOnce, AiServiceError } from "@/lib/ai/gemini";
import { resolveUserScope } from "@/lib/soma-ai/permissions";
import { logSomaAIInteraction } from "@/lib/soma-ai/audit";
import { DEFAULT_AI_CONFIG, type AiConfig } from "@/lib/soma-ai/config";
import { SOMA_TOOL_DECLARATIONS, dispatchTool, pruneToolCache } from "@/lib/soma-ai/tools";

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

  return `You are Soma AI, the intelligent assistant embedded in the Bidii School Management System.

You are speaking with **${opts.displayName}** (${opts.userEmail}), who is ${roleDescriptions[opts.role] ?? "a school user"} at **${opts.schoolName}**.

## Privacy and access rules (CRITICAL — never violate these)
${accessContext}

- NEVER reveal data about students outside this user's scope
- If asked about restricted data, politely decline without confirming the data exists
- Do not compare students across different families (for parent role)
- For system actions (sending messages, generating reports), always ask for confirmation first

## Answering data questions — IMPORTANT
You have access to live database tools. **Always call the appropriate tool** when a question requires specific numbers, names, records, or current status. Do NOT say "I don't have access to that data" or tell the user to check the UI manually — use the tools instead.

Examples of when to call tools:
- "Who is absent today?" → call getTodayAttendance
- "What are the exam results?" → call getExamResults
- "How many students do we have?" → call getStudentCount
- "Which class is performing best?" → call getClassRankings
- "How full are the dorms?" → call getDormOccupancy
- "Show me attendance trends" → call getAttendanceTrends
- "Tell me about [student name]" → call getStudentProfile

Only answer from your general knowledge when the question is about concepts (CBC framework, grading systems, best practices) or when drafting/writing text.

## Communication style
- Concise, direct, and professional — like a trusted expert colleague
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
  if (m <= 3) return "Term 1 (January–March)";
  if (m <= 7) return "Term 2 (April–July)";
  return "Term 3 (August–November)";
}

function buildSuggestionsPrompt(userMessage: string, assistantResponse: string, role: string): string {
  const roleHints: Record<string, string> = {
    parent: "The user is a parent viewing their child's school data.",
    teacher: "The user is a teacher managing their classes.",
    principal: "The user is a school principal with full admin access.",
    staff: "The user is administrative staff.",
    student: "The user is a student viewing their own records.",
  };
  return `${roleHints[role] ?? ""} Based on this exchange, generate exactly 3 short follow-up questions they might ask next.

User asked: "${userMessage.slice(0, 200)}"
Assistant: "${assistantResponse.slice(0, 300)}"

Return ONLY a JSON array of 3 strings. Example: ["Show me last week too", "Which class had the best attendance?", "How do I export this?"]`;
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await requireRole("PRINCIPAL", "TEACHER", "ADMIN_STAFF", "PARENT", "STUDENT");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ── Resolve permission scope ──────────────────────────────────────────────
  const scope = await resolveUserScope(user);

  // Display role for system prompt and audit
  const roleMap: Record<string, string> = {
    PRINCIPAL: "principal", TEACHER: "teacher", ADMIN_STAFF: "staff",
    PARENT: "parent", STUDENT: "student",
  };
  const displayRole = parsed.context?.role ?? roleMap[user.role] ?? "staff";

  // ── Check Gemini credentials ────────────────────────────────────────────
  const credentials = await getSchoolIntegrationKey(user.schoolId, "GEMINI");
  if (!credentials) {
    logSomaAIInteraction({
      userId: user.id,
      schoolId: user.schoolId,
      userRole: user.role,
      message: parsed.message,
      intent: "gemini",
      executionMs: Date.now() - t0,
      outcome: "error",
      errorSummary: "No Gemini key configured",
    });
    return NextResponse.json(
      {
        error: "Soma AI is not configured. Ask your Principal to add a Gemini API key under Settings → AI Configuration.",
        configIssue: true,
      },
      { status: 503 }
    );
  }

  const meta = (credentials.metadata ?? {}) as Record<string, unknown>;
  const aiConfig: AiConfig = {
    model: (meta.model as string) ?? DEFAULT_AI_CONFIG.model,
    temperature: (meta.temperature as number) ?? DEFAULT_AI_CONFIG.temperature,
    maxOutputTokens: (meta.maxOutputTokens as number) ?? DEFAULT_AI_CONFIG.maxOutputTokens,
    enabled: (meta.enabled as boolean) ?? DEFAULT_AI_CONFIG.enabled,
    cacheEnabled: (meta.cacheEnabled as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
    cacheTtlMinutes: (meta.cacheTtlMinutes as number) ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
  };

  if (!aiConfig.enabled) {
    return NextResponse.json(
      {
        error: "Soma AI is currently disabled. The Principal can re-enable it under Settings → AI Configuration.",
        configIssue: true,
      },
      { status: 503 }
    );
  }

  // ── Build system prompt (no static data snapshot — tools handle that) ───
  const systemInstruction = buildSystemPrompt({
    role: displayRole,
    schoolName: parsed.context?.schoolName ?? "your school",
    userEmail: user.email,
    displayName: scope.displayName,
    studentIds: scope.studentIds,
    classIds: scope.classIds,
    isAdmin: scope.isAdmin,
  });

  // ── Build conversation contents ─────────────────────────────────────────
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

  // ── Streaming response with tool calling ──────────────────────────────
  const encoder = new TextEncoder();
  void encoder; // used implicitly by sseEvent

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let outcome: "success" | "error" = "success";
      let errorSummary: string | undefined;
      const toolsUsed: string[] = [];

      try {
        incrementUsage(user.schoolId);

        await streamGeminiWithTools({
          schoolId: user.schoolId,
          contents,
          options: {
            systemInstruction,
            temperature: aiConfig.temperature,
            maxOutputTokens: aiConfig.maxOutputTokens,
            model: aiConfig.model,
            tools: SOMA_TOOL_DECLARATIONS,

            // Tool call handler — queries live DB and streams a status hint to the client
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

        // Best-effort follow-up suggestions (fast model, non-blocking)
        try {
          const suggestText = await callGeminiOnce({
            apiKey: credentials.apiKey,
            model: "gemini-2.0-flash",
            prompt: buildSuggestionsPrompt(parsed.message, fullResponse, displayRole),
            timeoutMs: 6000,
          });
          const suggestions = JSON.parse(suggestText) as string[];
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            controller.enqueue(sseEvent({ type: "suggestions", suggestions }));
          }
        } catch {/* best-effort */}

        const executionMs = Date.now() - t0;
        controller.enqueue(sseEvent({ type: "done", executionMs, toolsUsed }));
      } catch (e) {
        outcome = "error";
        const msg = e instanceof AiServiceError
          ? e.message
          : "Soma AI encountered an unexpected error. Please try again.";
        const isConfig = e instanceof AiServiceError && e.configIssue;
        errorSummary = msg.slice(0, 200);
        controller.enqueue(sseEvent({ type: "error", error: msg, configIssue: isConfig }));
      } finally {
        logSomaAIInteraction({
          userId: user.id,
          schoolId: user.schoolId,
          userRole: user.role,
          message: parsed.message,
          intent: "gemini",
          module: toolsUsed.length > 0 ? toolsUsed.join(",") : "gemini",
          executionMs: Date.now() - t0,
          outcome,
          errorSummary,
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
