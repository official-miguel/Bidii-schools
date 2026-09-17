import { getSchoolIntegrationKey } from "@/lib/integrations";
import { DEFAULT_AI_CONFIG, resolveModelId, MODEL_PRIORITY, MODEL_FALLBACK_CHAIN, DEFAULT_MODEL_ID, type AiConfig } from "@/lib/soma-ai/config";
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
const DEFAULT_RETRIES = 2; // retry once on transient failures; 429s get their own backoff

// ---------------------------------------------------------------------------
// In-process cache (prompt → response)
// ---------------------------------------------------------------------------

const _cache = new Map<string, { expires: number; value: string }>();

function cacheKey(schoolId: string, prompt: string, options: CallOptions) {
  // Normalize whitespace/case so trivially-different phrasings of the same
  // question (extra spaces, capitalization) still hit the shared cache —
  // this matters a lot when many users ask near-identical questions
  // ("who is absent today?" / "Who is absent today"), which is common
  // enough on a free-tier key that it meaningfully cuts request volume.
  const normalizedPrompt = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  return JSON.stringify([
    schoolId,
    normalizedPrompt,
    options.systemInstruction,
    options.responseSchema,
    options.model,
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Per-school concurrency throttle
// ---------------------------------------------------------------------------
//
// Free-tier Gemini keys have a low requests-per-minute ceiling. A school with
// several staff/parents chatting with Soma at once can easily fire enough
// simultaneous requests to blow through it, even though the *total* volume
// over a minute would have been fine. Rather than let bursts collide and
// bounce off 429s, we cap how many Gemini calls a single school can have
// in flight at once and queue the rest FIFO — so the first request to arrive
// is always the first one served, and everyone still gets an answer instead
// of a rate-limit error.
const MAX_CONCURRENT_PER_SCHOOL = 2;
const MAX_QUEUE_WAIT_MS = 20_000;

const _activeBySchool = new Map<string, number>();
const _queueBySchool = new Map<string, Array<() => void>>();

function releaseSlot(schoolId: string): void {
  const active = (_activeBySchool.get(schoolId) ?? 1) - 1;
  _activeBySchool.set(schoolId, Math.max(0, active));

  const queue = _queueBySchool.get(schoolId);
  const next = queue?.shift();
  if (next) next();
}

/**
 * Waits for a free "slot" for this school's Gemini traffic, then returns a
 * release function the caller MUST invoke (in a finally block) once its
 * request completes. Throws AiServiceError if the queue doesn't clear within
 * MAX_QUEUE_WAIT_MS, so a caller never hangs indefinitely under heavy load.
 */
async function acquireSchoolSlot(schoolId: string): Promise<() => void> {
  const active = _activeBySchool.get(schoolId) ?? 0;
  if (active < MAX_CONCURRENT_PER_SCHOOL) {
    _activeBySchool.set(schoolId, active + 1);
    return () => releaseSlot(schoolId);
  }

  return new Promise<() => void>((resolve, reject) => {
    let settled = false;
    const queue = _queueBySchool.get(schoolId) ?? [];

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const q = _queueBySchool.get(schoolId);
      if (q) {
        const idx = q.indexOf(onTurn);
        if (idx !== -1) q.splice(idx, 1);
      }
      reject(
        new AiServiceError(
          "Soma AI is handling a lot of questions right now. Please try again in a few seconds.",
          false
        )
      );
    }, MAX_QUEUE_WAIT_MS);

    function onTurn() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      _activeBySchool.set(schoolId, (_activeBySchool.get(schoolId) ?? 0) + 1);
      resolve(() => releaseSlot(schoolId));
    }

    queue.push(onTurn);
    _queueBySchool.set(schoolId, queue);
  });
}

// ---------------------------------------------------------------------------
// Fetch with 429 retry — shared by all three Gemini call paths
// ---------------------------------------------------------------------------

/**
 * Statuses worth retrying. 429 = rate limit, 5xx = Gemini-side overload
 * ("The model is overloaded") — both are transient and clear on their own,
 * unlike 4xx auth/validation errors which never will.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Attempts against a single model before moving down the fallback chain. */
const ATTEMPTS_PER_MODEL = 3;

/**
 * Backoff with jitter. Jitter matters a lot here: without it, every user whose
 * request bounced off the same overload retries at the same instant and the
 * model gets hammered again in lockstep. Randomizing spreads the herd out.
 */
function backoffMs(attempt: number, retryAfterSec: number, maxWaitMs: number): number {
  if (retryAfterSec > 0) return Math.min(retryAfterSec * 1000, maxWaitMs);
  const base = 600 * 2 ** attempt; // 600ms → 1.2s → 2.4s
  const jittered = base * (0.5 + Math.random()); // ±50%
  return Math.min(Math.round(jittered), maxWaitMs);
}

/**
 * Builds the ordered list of models to try: the school's configured model
 * first, then progressively lighter fallbacks that are less likely to be
 * contended.
 */
function buildModelChain(configured: string): string[] {
  return [configured, ...MODEL_FALLBACK_CHAIN.filter((m) => m !== configured)];
}

/**
 * Performs a Gemini request with two layers of resilience:
 *
 *   1. Transient failures (429 rate-limit, 5xx overload) are retried against
 *      the same model with jittered exponential backoff.
 *   2. If a model stays unavailable — persistently overloaded, or a 404
 *      meaning this key can't use it — we fall back to the next model in the
 *      chain instead of failing the user's question.
 *
 * Auth/validation failures (400/401/403) throw immediately: retrying or
 * switching models can never fix a bad key.
 *
 * Returns the successful Response along with the model that produced it.
 */
async function geminiFetch(opts: {
  schoolId: string;
  apiKey: string;
  /** Model to try first; lighter fallbacks are appended automatically. */
  model: string;
  endpoint: "generateContent" | "streamGenerateContent";
  /** Appended to the URL, e.g. "&alt=sse" for streaming */
  query?: string;
  body: unknown;
  signal?: AbortSignal;
  maxWaitMs?: number;
  label: string;
}): Promise<{ res: Response; model: string }> {
  const maxWaitMs = opts.maxWaitMs ?? 8_000;
  const chain = buildModelChain(opts.model);
  let lastStatus = 0;
  let lastDetail = "";
  let sawNotFound = false;

  for (const model of chain) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:${opts.endpoint}` +
          `?key=${encodeURIComponent(opts.apiKey)}${opts.query ?? ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: opts.signal,
          body: JSON.stringify(opts.body),
        }
      );

      if (res.ok) {
        // Remember a fallback that worked so the next request starts here
        // instead of paying the same overload penalty again.
        if (model !== opts.model) void saveWorkingModel(opts.schoolId, model);
        return { res, model };
      }

      lastStatus = res.status;

      // Unfixable by retry or fallback — surface immediately.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => "");
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

      // Model not available to this key — no point retrying it, move on.
      if (res.status === 404) {
        sawNotFound = true;
        lastDetail = `model "${model}" unavailable (404)`;
        break;
      }

      if (!RETRYABLE_STATUS.has(res.status)) {
        lastDetail = `unexpected HTTP ${res.status} on "${model}"`;
        break; // try the next model rather than giving up outright
      }

      lastDetail = `HTTP ${res.status} on "${model}"`;
      const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "0", 10);

      // Last attempt for this model — drop to the next one immediately
      // rather than burning more time on a model that keeps failing.
      if (attempt === ATTEMPTS_PER_MODEL - 1) break;

      const waitMs = backoffMs(attempt, retryAfterSec, maxWaitMs);
      console.warn(
        `[ai/${opts.label}] ${res.status} on "${model}" ` +
          `(attempt ${attempt + 1}/${ATTEMPTS_PER_MODEL}) — retrying in ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }

  // Last resort: if models were rejected as non-existent, our hardcoded chain
  // itself is stale (Google renamed/retired them). Ask the API what this key
  // can actually use and try that once, so a model rename can never take Soma
  // down until someone ships a code change.
  if (sawNotFound) {
    const probed = await autoPickModel(opts.schoolId, opts.apiKey);
    if (!chain.includes(probed)) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${probed}:${opts.endpoint}` +
          `?key=${encodeURIComponent(opts.apiKey)}${opts.query ?? ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: opts.signal,
          body: JSON.stringify(opts.body),
        }
      );
      if (res.ok) {
        void saveWorkingModel(opts.schoolId, probed);
        return { res, model: probed };
      }
      lastDetail = `probed model "${probed}" also failed (HTTP ${res.status})`;
    }
  }

  // Every model in the chain failed.
  if (lastStatus === 429) {
    throw new AiServiceError(
      "Soma AI has hit its usage limit for the moment. Please try again in a minute.",
      false,
      undefined,
      `All models rate-limited — ${lastDetail}`
    );
  }
  throw new AiServiceError(
    "Soma AI is busy right now. Please try again in a moment.",
    false,
    undefined,
    `All models failed — ${lastDetail}`
  );
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
export async function autoPickModel(schoolId: string, apiKey: string): Promise<string> {
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
  const model = options.model ?? config.model;
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

  const releaseSchoolSlot = await acquireSchoolSlot(schoolId);
  try {
  // Retry/backoff and model fallback are handled inside geminiFetch; this
  // loop only covers network-level failures (timeouts, dropped connections)
  // and empty completions, which need a fresh request rather than a retry
  // of the same in-flight one.
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { res } = await geminiFetch({
        schoolId,
        apiKey,
        model,
        endpoint: "generateContent",
        signal: controller.signal,
        label: "callGemini",
        body: {
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
        },
      });

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
      console.error(
        `[ai/gemini] attempt ${attempt + 1}/${retries + 1} failed${timedOut ? " (timeout)" : ""}:`,
        err?.message || e
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
  } finally {
    releaseSchoolSlot();
  }
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

  const model = opts.options?.model ?? config.model;
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
    const { res } = await geminiFetch({
      schoolId: opts.schoolId,
      apiKey,
      model,
      endpoint: "streamGenerateContent",
      query: "&alt=sse",
      signal: controller.signal,
      label: "streamGemini",
      body: {
        contents: opts.contents,
        ...(opts.options?.systemInstruction
          ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
          : {}),
        generationConfig: { temperature, maxOutputTokens },
      },
    });

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
  /** Pre-resolved credentials — skip the internal DB lookup if provided. */
  resolvedApiKey?: string;
  resolvedConfig?: AiConfig;
}): Promise<string> {
  // Use pre-resolved credentials if provided (avoids a second DB round-trip)
  let apiKey: string;
  let config: AiConfig;

  if (opts.resolvedApiKey && opts.resolvedConfig) {
    apiKey = opts.resolvedApiKey;
    config = opts.resolvedConfig;
  } else {
    const resolved = await resolveSchoolConfig(opts.schoolId);
    if (!resolved) {
      throw new AiServiceError(
        "Soma AI isn't set up for this school yet. Contact your system administrator.",
        true,
        undefined,
        "No Gemini key configured"
      );
    }
    apiKey = resolved.apiKey;
    config = resolved.config;
  }

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
  let toolModel = config.model; // use school's configured model (already resolved via autoPickModel)
  const answerModel = opts.options.model ?? config.model;
  const temperature = opts.options.temperature ?? config.temperature;
  const maxOutputTokens = opts.options.maxOutputTokens ?? config.maxOutputTokens;
  const timeoutMs = opts.options.timeoutMs ?? 30_000;

  const tools = opts.options.tools ?? [];
  const hasFunctions = tools.length > 0 && !!opts.options.onToolCall;

  // Build the mutable conversation we extend on each tool round
  const conversation: GeminiContent[] = [...opts.contents];

  const releaseSchoolSlot = await acquireSchoolSlot(opts.schoolId);
  try {
    return await runStreamWithTools();
  } finally {
    releaseSchoolSlot();
  }

  async function runStreamWithTools(): Promise<string> {
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
        const { res, model: usedModel } = await geminiFetch({
          schoolId: opts.schoolId,
          apiKey,
          model: toolModel,
          endpoint: "generateContent",
          signal: controller.signal,
          label: "tool-round",
          body: {
            contents: conversation,
            ...(opts.options.systemInstruction
              ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
              : {}),
            tools: [{ functionDeclarations: tools }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
            generationConfig: { temperature: 0, maxOutputTokens: 512 },
          },
        });
        // Stick with whatever model actually worked for the remaining rounds.
        toolModel = usedModel;
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
    const { res } = await geminiFetch({
      schoolId: opts.schoolId,
      apiKey,
      model: answerModel,
      endpoint: "streamGenerateContent",
      query: "&alt=sse",
      signal: controller.signal,
      label: "answer",
      body: {
        contents: conversation,
        ...(opts.options.systemInstruction
          ? { systemInstruction: { parts: [{ text: opts.options.systemInstruction }] } }
          : {}),
        generationConfig: { temperature, maxOutputTokens },
        // Do NOT include tools here — this is the final answer turn; we
        // don't want Gemini to call more functions, just respond in text.
      },
    });

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
