import { getSchoolIntegrationKey } from "@/lib/integrations";
import { DEFAULT_AI_CONFIG, resolveModelId, MODEL_PRIORITY, DEFAULT_MODEL_ID, type AiConfig } from "@/lib/soma-ai/config";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/// Centralized Gemini client — every AI feature (Timetable, TOD, School
/// Intelligence, Soma AI) calls through here rather than hitting the API
/// directly. If Bidii ever needs to support a different provider, this is
/// the one file that changes; callers only ever see callGemini()/generateJson().
export class AiServiceError extends Error {
  /// True for problems the Principal can fix themselves (missing/invalid
  /// key) as opposed to transient network/provider failures — lets callers
  /// show a "go to Settings → AI Configuration" link vs. a generic "try again".
  constructor(
    message: string,
    public configIssue = false,
    public cause?: unknown,
    /** Technical detail (HTTP status, Google's error body) — for
     *  console.error and audit logs ONLY. Never send this to a
     *  school-facing response. */
    public internalDetail?: string
  ) {
    super(message);
  }
}

type CallOptions = {
  systemInstruction?: string;
  /// Gemini's structured-output JSON schema (OpenAPI-subset). When set, the
  /// response is guaranteed valid JSON matching this shape instead of free
  /// text — used for anything the app needs to parse programmatically.
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
  /// Cache identical calls (same school + prompt + options) for this long.
  /// 0 disables caching. Useful for anything the UI might re-request within
  /// a session (e.g. re-opening a panel) without spending another call.
  cacheTtlMs?: number;
  /// Optional inline file (image/PDF) sent alongside the prompt — used by the
  /// Records module to summarize uploaded discipline documents.
  inlineFile?: { mimeType: string; base64: string };
  /// Override the model for this single call. Falls back to school config,
  /// then DEFAULT_AI_CONFIG.model.
  model?: string;
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1; // free-tier: keep retries low to avoid RPM pile-up

// ---------------------------------------------------------------------------
// In-process cache (prompt → response)
// ---------------------------------------------------------------------------

const _cache = new Map<string, { expires: number; value: string }>();

function cacheKey(schoolId: string, prompt: string, options: CallOptions) {
  return JSON.stringify([
    schoolId,
    prompt,
    options.systemInstruction,
    options.responseSchema,
    options.model,
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fetch with 429 retry — shared by all three Gemini call paths
// ---------------------------------------------------------------------------

/**
 * Wraps fetch() with automatic retry on HTTP 429 (rate limit).
 * Respects the Retry-After header when present; falls back to exponential
 * back-off capped at maxWaitMs. Throws AiServiceError only after all retries
 * are exhausted (or immediately for 4xx auth failures).
 */
async function fetchWith429Retry(
  url: string,
  init: RequestInit,
  opts: {
    retries?: number;
    /** Hard cap on any single wait period, in ms */
    maxWaitMs?: number;
    label?: string;
  } = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const maxWaitMs = opts.maxWaitMs ?? 15_000;
  const label = opts.label ?? "gemini";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);

    if (res.status !== 429) return res; // success or non-retryable error

    const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "0", 10);
    const waitMs = retryAfterSec > 0
      ? Math.min(retryAfterSec * 1000, maxWaitMs)
      : Math.min(2000 * 2 ** attempt, maxWaitMs); // 2s → 4s → 8s → …

    console.warn(
      `[ai/${label}] 429 rate-limited on attempt ${attempt + 1}/${retries + 1}. Waiting ${waitMs}ms before retry.`
    );

    if (attempt < retries) {
      await sleep(waitMs);
      continue;
    }

    // All retries exhausted — return the 429 response so the caller can throw
    return res;
  }

  // TypeScript: unreachable, but needed for the return type
  throw new AiServiceError("Unexpected retry loop exit.", false);
}

// ---------------------------------------------------------------------------
// Resolve school AI config from metadata (one DB read, fast path)
// ---------------------------------------------------------------------------

async function resolveSchoolConfig(schoolId: string): Promise<{
  apiKey: string;
  config: AiConfig;
} | null> {
  const credentials = await getSchoolIntegrationKey(schoolId, "GEMINI");
  if (!credentials) return null;

  const meta = (credentials.metadata ?? {}) as Record<string, unknown>;
  const config: AiConfig = {
    model: resolveModelId(meta.model as string | null),
    temperature: (meta.temperature as number) ?? DEFAULT_AI_CONFIG.temperature,
    maxOutputTokens: (meta.maxOutputTokens as number) ?? DEFAULT_AI_CONFIG.maxOutputTokens,
    enabled: (meta.enabled as boolean) ?? DEFAULT_AI_CONFIG.enabled,
    cacheEnabled: (meta.cacheEnabled as boolean) ?? DEFAULT_AI_CONFIG.cacheEnabled,
    cacheTtlMinutes: (meta.cacheTtlMinutes as number) ?? DEFAULT_AI_CONFIG.cacheTtlMinutes,
  };

  return { apiKey: credentials.apiKey, config };
}

// ---------------------------------------------------------------------------
// Auto-pick model — queries the API and saves the best working model
// ---------------------------------------------------------------------------

/**
 * Saves a working model ID back to the school's stored config so future
 * calls use it without another probe round-trip.
 */
async function saveWorkingModel(schoolId: string, model: string): Promise<void> {
  try {
    const row = await prisma.schoolIntegration.findUnique({
      where: { schoolId_provider: { schoolId, provider: "GEMINI" } },
    });
    if (!row) return;
    const existingMeta = (row.metadata ?? {}) as Record<string, unknown>;
    await prisma.schoolIntegration.update({
      where: { schoolId_provider: { schoolId, provider: "GEMINI" } },
      data: { metadata: { ...existingMeta, model } as Prisma.InputJsonValue },
    });
  } catch {
    // Non-fatal — if this fails the next call will just try again
  }
}

/**
 * Queries ListModels for the API key and returns the best model from
 * MODEL_PRIORITY that the key can actually access. Falls back to
 * DEFAULT_MODEL_ID if the ListModels call fails or returns nothing useful.
 * On success, saves the chosen model to the school's stored config.
 */
async function autoPickModel(schoolId: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return DEFAULT_MODEL_ID;

    type ListRes = { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const data: ListRes = await res.json().catch(() => ({}));
    const available = new Set(
      (data.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
    );

    const picked = MODEL_PRIORITY.find((m) => available.has(m)) ?? DEFAULT_MODEL_ID;
    // Save asynchronously — don't await so callers aren't blocked
    void saveWorkingModel(schoolId, picked);
    return picked;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

// ---------------------------------------------------------------------------
// Core callGemini — non-streaming, with retries and cache
// ---------------------------------------------------------------------------

/// Calls Gemini with this school's own API key and returns the raw text
/// response. Handles timeouts, retries with backoff, and never throws a raw
/// fetch/parse error — always an AiServiceError with a message safe to show.
export async function callGemini(
  schoolId: string,
  prompt: string,
  options: CallOptions = {}
): Promise<string> {
  const resolved = await resolveSchoolConfig(schoolId);
  if (!resolved) {
    throw new AiServiceError(
      "Soma AI isn't set up for this school yet. Contact your system administrator.",
      true,
      undefined,
      "No Gemini key configured"
    );
  }

  const { apiKey, config } = resolved;

  if (!config.enabled) {
    throw new AiServiceError(
      "Soma AI is currently turned off for this school. Contact your system administrator to enable it.",
      true,
      undefined,
      "Soma AI disabled in school config"
    );
  }

  // Determine model: per-call override → school config → default
  let model = options.model ?? config.model;
  const temperature = options.temperature ?? config.temperature;
  const maxOutputTokens = options.maxOutputTokens ?? config.maxOutputTokens;

  // Cache check
  const cacheTtlMs = options.cacheTtlMs ?? (config.cacheEnabled ? config.cacheTtlMinutes * 60 * 1000 : 0);
  const ck = cacheTtlMs > 0 ? cacheKey(schoolId, prompt, { ...options, model }) : null;
  if (ck) {
    const cached = _cache.get(ck);
    if (cached && cached.expires > Date.now()) return cached.value;
  }

  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  ...(options.inlineFile
                    ? [{ inlineData: { mimeType: options.inlineFile.mimeType, data: options.inlineFile.base64 } }]
                    : []),
                ],
              },
            ],
            ...(options.systemInstruction
              ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
              : {}),
            generationConfig: {
              temperature,
              maxOutputTokens,
              responseMimeType: options.responseSchema ? "application/json" : "text/plain",
              ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
            },
          }),
        }
      );

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => "");
        // Parse Google's error detail if available
        let detail = "";
        try {
          const parsed = JSON.parse(body);
          detail = parsed?.error?.message ?? parsed?.error?.status ?? "";
        } catch { /* not JSON */ }
        throw new AiServiceError(
          "Soma AI isn't fully set up for this school yet. Contact your system administrator.",
          true,
          body,
          `Gemini key rejected (HTTP ${res.status}${detail ? ": " + detail : ""})`
        );
      }
      if (res.status === 404) {
        // Model not available for this key — auto-detect a working model
        // and retry immediately with it (don't count as a failed attempt)
        const picked = await autoPickModel(schoolId, apiKey);
        if (picked !== model) {
          model = picked;
          continue; // retry with the new model
        }
        throw new AiServiceError(
          "Soma AI is having a temporary issue. Please try again shortly.",
          true,
          undefined,
          `Model "${model}" unavailable (404) — auto-pick also failed`
        );
      }
      if (res.status === 429) {
        // Rate-limited — respect Retry-After if present, otherwise use
        // exponential backoff capped at half the remaining timeout budget.
        const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "0", 10);
        const maxWaitMs = Math.floor(timeoutMs / 2);
        const waitMs = retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, maxWaitMs)
          : Math.min(5000 * 2 ** attempt, maxWaitMs); // 5s → 10s → 20s, capped
        console.warn(
          `[ai/gemini] 429 rate-limited on attempt ${attempt + 1}/${retries + 1}. Waiting ${waitMs}ms before retry.`
        );
        if (attempt < retries) {
          await sleep(waitMs);
          continue;
        }
        throw new AiServiceError(
          "The AI service is currently rate-limited. Please wait a moment and try again.",
          false
        );
      }
      if (!res.ok) {
        throw new Error(`Unexpected HTTP ${res.status}`);
      }

      const data: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("Gemini returned an empty response.");

      if (ck) _cache.set(ck, { expires: Date.now() + cacheTtlMs, value: text });
      return text;
    } catch (e) {
      if (e instanceof AiServiceError) throw e;
      lastError = e;
      const err = e as { name?: string; message?: string };
      const timedOut = err?.name === "AbortError";
      // For AiServiceError we log internalDetail (the Google-specific info);
      // for raw errors we log the message directly.
      const logDetail = e instanceof AiServiceError
        ? ((e as AiServiceError).internalDetail ?? e.message)
        : err?.message || e;
      console.error(
        `[ai/gemini] attempt ${attempt + 1}/${retries + 1} failed${timedOut ? " (timeout)" : ""}:`,
        logDetail
      );
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt); // 400ms → 800ms → …
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new AiServiceError(
    "Soma AI couldn't respond after a few attempts. Please try again shortly.",
    false,
    lastError
  );
}

// ---------------------------------------------------------------------------
// Streaming Gemini — used by Soma AI chat for progressive responses
// ---------------------------------------------------------------------------

export type StreamChunkCallback = (text: string) => void;

export interface StreamOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  model?: string;
}

// Shared content type used by both streamGemini and streamGeminiWithTools
type GeminiContent = {
  role: string;
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: { content: string } } }
  >;
};

/// Streams a Gemini response, calling onChunk for each piece of text.
/// Returns the full accumulated text on completion.
/// Throws AiServiceError on config/key problems.
export async function streamGemini(opts: {
  schoolId: string;
  contents: GeminiContent[];
  options?: StreamOptions;
  signal?: AbortSignal;
  onChunk: StreamChunkCallback;
}): Promise<string> {
  const resolved = await resolveSchoolConfig(opts.schoolId);
  if (!resolved) {
    throw new AiServiceError(
      "Soma AI isn't set up for this school yet. Contact your system administrator.",
      true,
      undefined,
      "No Gemini key configured"
    );
  }

  const { apiKey, config } = resolved;

  if (!config.enabled) {
    throw new AiServiceError(
      "Soma AI is currently turned off for this school. Contact your system administrator to enable it.",
      true,
      undefined,
      "Soma AI disabled in school config"
    );
  }

  let model = opts.options?.model ?? config.model;
  const temperature = opts.options?.temperature ?? config.temperature;
  const maxOutputTokens = opts.options?.maxOutputTokens ?? config.maxOutputTokens;
  const timeoutMs = opts.options?.timeoutMs ?? 30000;

  const controller = new AbortController();
  // Chain caller's abort signal
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWith429Retry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: opts.contents,
          ...(opts.options?.systemInstruction
            ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
            : {}),
          generationConfig: { temperature, maxOutputTokens },
        }),
      },
      { retries: 1, maxWaitMs: 12_000, label: "streamGemini" }
    );

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      let detail = "";
      try { const p = JSON.parse(body); detail = p?.error?.message ?? p?.error?.status ?? ""; } catch { /* */ }
      throw new AiServiceError(
        "Soma AI isn't fully set up for this school yet. Contact your system administrator.",
        true,
        body,
        `Gemini key rejected (HTTP ${res.status}${detail ? ": " + detail : ""})`
      );
    }
    if (res.status === 404) {
      // Kick off auto-pick asynchronously — next request will use the correct model
      void autoPickModel(opts.schoolId, apiKey);
      throw new AiServiceError(
        "Soma AI is having a temporary issue. Please try again shortly.",
        true,
        undefined,
        `Model "${model}" unavailable (404) — auto-picking new model for next request`
      );
    }
    if (res.status === 429) {
      // All retries exhausted
      throw new AiServiceError(
        "The AI service is busy right now. Please wait a moment and try again.",
        false
      );
    }
    if (!res.ok) {
      throw new AiServiceError("Soma AI is having a temporary issue. Please try again shortly.", false, undefined, `Unexpected HTTP ${res.status}`);
    }
    if (!res.body) throw new AiServiceError("No response body from AI.", false);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return fullText;

        try {
          const parsed: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = JSON.parse(data);
          const chunk = parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (chunk) {
            fullText += chunk;
            opts.onChunk(chunk);
          }
        } catch {
          // malformed SSE chunk — skip
        }
      }
    }

    return fullText;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Function / tool calling — used by Soma AI chat
// ---------------------------------------------------------------------------

/**
 * Gemini function declaration shape (subset of the full spec we need).
 * Matches GeminiToolDeclaration from soma-ai/tools.ts but kept here as a
 * standalone type so gemini.ts stays free of Soma-specific imports.
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

/** A single function call requested by Gemini */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface StreamWithToolsOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  model?: string;
  /** Tool declarations to expose to the model */
  tools?: FunctionDeclaration[];
  /**
   * Called whenever Gemini wants to invoke a function.
   * Must return the result as a string that gets fed back to the model.
   */
  onToolCall?: (call: GeminiFunctionCall) => Promise<string>;
  /** Called for each streamed text chunk in the final answer */
  onChunk: StreamChunkCallback;
}

/**
 * streamGeminiWithTools — streaming Gemini call with function/tool calling.
 *
 * Flow:
 *   1. Send the conversation + tool declarations to Gemini.
 *   2. If Gemini returns a functionCall part instead of text, invoke onToolCall().
 *   3. Append the tool result to the conversation and call Gemini again.
 *   4. Repeat up to MAX_TOOL_ROUNDS.
 *   5. Stream the final text response via onChunk.
 *
 * The final text turn is streamed; tool-call rounds are non-streaming
 * (they're short round-trips that have to complete before the model can
 * continue, so streaming them would add latency rather than reduce it).
 */
const MAX_TOOL_ROUNDS = 5;

export async function streamGeminiWithTools(opts: {
  schoolId: string;
  contents: GeminiContent[];
  options: StreamWithToolsOptions;
  signal?: AbortSignal;
}): Promise<string> {
  const resolved = await resolveSchoolConfig(opts.schoolId);
  if (!resolved) {
    throw new AiServiceError(
      "Soma AI isn't set up for this school yet. Contact your system administrator.",
      true,
      undefined,
      "No Gemini key configured"
    );
  }

  const { apiKey, config } = resolved;
  if (!config.enabled) {
    throw new AiServiceError(
      "Soma AI is currently turned off for this school. Contact your system administrator to enable it.",
      true,
      undefined,
      "Soma AI disabled in school config"
    );
  }

  // Always pick the fastest/cheapest model for tool-calling rounds.
  // The school config model is used for the final streaming answer.
  const toolModel = "gemini-2.5-flash-lite";
  const answerModel = opts.options.model ?? config.model;
  const temperature = opts.options.temperature ?? config.temperature;
  const maxOutputTokens = opts.options.maxOutputTokens ?? config.maxOutputTokens;
  const timeoutMs = opts.options.timeoutMs ?? 30_000;

  const tools = opts.options.tools ?? [];
  const hasFunctions = tools.length > 0 && !!opts.options.onToolCall;

  // Build the mutable conversation we extend on each tool round
  const conversation: GeminiContent[] = [...opts.contents];

  // ── Tool-calling rounds (non-streaming, fast model) ────────────────────
  if (hasFunctions) {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const controller = new AbortController();
      if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());
      const timeout = setTimeout(() => controller.abort(), 20_000);

      let roundData: {
        candidates?: {
          content?: {
            parts?: Array<
              | { text?: string }
              | { functionCall?: { name: string; args: Record<string, unknown> } }
            >;
          };
          finishReason?: string;
        }[];
      };

      try {
        const res = await fetchWith429Retry(
          `https://generativelanguage.googleapis.com/v1beta/models/${toolModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: conversation,
              ...(opts.options.systemInstruction
                ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
                : {}),
              tools: [{ functionDeclarations: tools }],
              toolConfig: { functionCallingConfig: { mode: "AUTO" } },
              generationConfig: { temperature: 0, maxOutputTokens: 512 },
            }),
          },
          { retries: 1, maxWaitMs: 12_000, label: "streamGeminiWithTools/tool-round" }
        );

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          const errBody = await res.text().catch(() => "");
          let detail = "";
          try { const p = JSON.parse(errBody); detail = p?.error?.message ?? p?.error?.status ?? ""; } catch { /* */ }
          throw new AiServiceError(
            "Soma AI isn't fully set up for this school yet. Contact your system administrator.",
            true,
            undefined,
            `Gemini key rejected (HTTP ${res.status}${detail ? ": " + detail : ""})`
          );
        }
        if (res.status === 429) {
          // All retries exhausted
          throw new AiServiceError(
            "The AI service is busy right now. Please wait a moment and try again.",
            false
          );
        }
        if (!res.ok) throw new AiServiceError("Soma AI is having a temporary issue. Please try again shortly.", false, undefined, `Unexpected HTTP ${res.status}`);
        roundData = await res.json();
      } finally {
        clearTimeout(timeout);
      }

      const candidate = roundData.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Collect all function calls in this turn
      const functionCallParts = parts.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p && !!p.functionCall
      );

      // If no function calls, Gemini is done deciding — move to streaming answer
      if (functionCallParts.length === 0) break;

      // Push the model's function-call turn into the conversation
      conversation.push({
        role: "model",
        parts: functionCallParts.map((p) => ({ functionCall: p.functionCall })),
      });

      // Resolve each call and push all results back as a user turn
      const resultParts: GeminiContent["parts"] = [];
      for (const { functionCall } of functionCallParts) {
        let result: string;
        try {
          result = await opts.options.onToolCall!({ name: functionCall.name, args: functionCall.args });
        } catch (e) {
          result = `Error executing ${functionCall.name}: ${e instanceof Error ? e.message : String(e)}`;
        }
        resultParts.push({
          functionResponse: { name: functionCall.name, response: { content: result } },
        });
      }
      conversation.push({ role: "user", parts: resultParts });
    }
  }

  // ── Final streaming answer (configured model) ──────────────────────────
  const controller = new AbortController();
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWith429Retry(
      `https://generativelanguage.googleapis.com/v1beta/models/${answerModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: conversation,
          ...(opts.options.systemInstruction
            ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
            : {}),
          generationConfig: { temperature, maxOutputTokens },
          // Do NOT include tools here — this is the final answer turn; we
          // don't want Gemini to call more functions, just respond in text.
        }),
      },
      { retries: 1, maxWaitMs: 12_000, label: "streamGeminiWithTools/answer" }
    );

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const errBody = await res.text().catch(() => "");
      let detail = "";
      try { const p = JSON.parse(errBody); detail = p?.error?.message ?? p?.error?.status ?? ""; } catch { /* */ }
      throw new AiServiceError(
        "Soma AI isn't fully set up for this school yet. Contact your system administrator.",
        true,
        undefined,
        `Gemini key rejected (HTTP ${res.status}${detail ? ": " + detail : ""})`
      );
    }
    if (res.status === 404) {
      // Kick off auto-pick asynchronously — next request will use the correct model
      void autoPickModel(opts.schoolId, apiKey);
      throw new AiServiceError(
        "Soma AI is having a temporary issue. Please try again shortly.",
        true,
        undefined,
        `Model "${answerModel}" unavailable (404) — auto-picking new model for next request`
      );
    }
    if (res.status === 429) {
      // All retries exhausted
      throw new AiServiceError(
        "The AI service is busy right now. Please wait a moment and try again.",
        false
      );
    }
    if (!res.ok) throw new AiServiceError("Soma AI is having a temporary issue. Please try again shortly.", false, undefined, `Unexpected HTTP ${res.status}`);
    if (!res.body) throw new AiServiceError("No response body from AI.", false);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return fullText;

        try {
          const parsed: { candidates?: { content?: { parts?: { text?: string }[] } }[] } =
            JSON.parse(data);
          const chunk =
            parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (chunk) {
            fullText += chunk;
            opts.options.onChunk(chunk);
          }
        } catch {
          // malformed SSE chunk — skip
        }
      }
    }

    return fullText;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// generateJson — convenience wrapper for structured JSON responses
// ---------------------------------------------------------------------------

/// Falls back to `fallback` (instead of throwing) when Gemini is unreachable
/// or returns something unparseable — every AI feature in Bidii must degrade
/// gracefully rather than break the page it's embedded in.
export async function generateJson<T>(
  schoolId: string,
  prompt: string,
  options: CallOptions & { fallback: T }
): Promise<{ value: T; usedFallback: boolean; error?: string }> {
  try {
    const text = await callGemini(schoolId, prompt, options);
    return { value: JSON.parse(text) as T, usedFallback: false };
  } catch (e) {
    const message = e instanceof AiServiceError ? e.message : "The AI is temporarily unavailable.";
    return { value: options.fallback, usedFallback: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// One-shot call (best-effort, no retries — used for suggestions, etc.)
// ---------------------------------------------------------------------------

export async function callGeminiOnce(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "[]";
  } finally {
    clearTimeout(timeout);
  }
}
