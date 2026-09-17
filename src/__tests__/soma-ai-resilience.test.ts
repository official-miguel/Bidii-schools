/**
 * Soma AI resilience tests.
 *
 * Soma runs on free-tier Gemini keys shared by every user in a school, so the
 * failures that matter in production are transient ones: 503 "model
 * overloaded" and 429 rate limits. These tests pin the recovery behaviour —
 * retry the same model, then fall back to a lighter one, and never retry an
 * error that retrying cannot fix.
 */

const mockGetSchoolIntegrationKey = jest.fn();

jest.mock("@/lib/integrations", () => ({
  getSchoolIntegrationKey: (...args: unknown[]) => mockGetSchoolIntegrationKey(...args),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    schoolIntegration: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
    },
  },
}));

import { callGemini, AiServiceError } from "@/lib/ai/gemini";

const SCHOOL_ID = "school_1";
const CONFIGURED_MODEL = "gemini-3.8-flash";

/** Minimal shape of a successful Gemini generateContent response. */
function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => text,
    headers: { get: () => null },
  };
}

function errorResponse(status: number, body = "") {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
    headers: { get: () => null },
  };
}

/** Pulls the model id out of a generativelanguage URL. */
function modelFromUrl(url: string): string {
  return url.match(/models\/([^:]+):/)?.[1] ?? "";
}

/**
 * Runs a promise to settlement while fake timers are active, draining any
 * backoff sleeps it schedules along the way.
 */
async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const result: { value?: T; error?: unknown } = {};
  let done = false;
  promise.then(
    (v) => { result.value = v; done = true; },
    (e) => { result.error = e; done = true; }
  );
  // Each pass advances past the longest possible backoff window.
  for (let i = 0; i < 40 && !done; i++) {
    await jest.advanceTimersByTimeAsync(10_000);
  }
  return result;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGetSchoolIntegrationKey.mockResolvedValue({
    apiKey: "test-key",
    metadata: {
      model: CONFIGURED_MODEL,
      enabled: true,
      cacheEnabled: false, // keep each test independent of the response cache
    },
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Gemini transient-failure handling", () => {
  it("retries the same model after a 503 overload and succeeds", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(modelFromUrl(String(url)));
      return calls.length === 1 ? errorResponse(503) : okResponse("recovered");
    }) as unknown as typeof fetch;

    const { value, error } = await settle(callGemini(SCHOOL_ID, "hi"));

    expect(error).toBeUndefined();
    expect(value).toBe("recovered");
    expect(calls).toEqual([CONFIGURED_MODEL, CONFIGURED_MODEL]);
  });

  it("falls back to a lighter model when the configured one stays overloaded", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      const model = modelFromUrl(String(url));
      calls.push(model);
      // The configured model is permanently overloaded; anything else works.
      return model === CONFIGURED_MODEL ? errorResponse(503) : okResponse("from fallback");
    }) as unknown as typeof fetch;

    const { value, error } = await settle(callGemini(SCHOOL_ID, "hi"));

    expect(error).toBeUndefined();
    expect(value).toBe("from fallback");
    // Exhausts its attempts on the configured model, then moves on.
    expect(calls.filter((m) => m === CONFIGURED_MODEL)).toHaveLength(3);
    expect(calls[calls.length - 1]).not.toBe(CONFIGURED_MODEL);
  });

  it("skips a model the key cannot access (404) without retrying it", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      const model = modelFromUrl(String(url));
      calls.push(model);
      return model === CONFIGURED_MODEL ? errorResponse(404) : okResponse("ok");
    }) as unknown as typeof fetch;

    const { value, error } = await settle(callGemini(SCHOOL_ID, "hi"));

    expect(error).toBeUndefined();
    expect(value).toBe("ok");
    // A 404 is not transient — the model is tried exactly once.
    expect(calls.filter((m) => m === CONFIGURED_MODEL)).toHaveLength(1);
  });

  it("fails fast on a rejected API key instead of retrying or falling back", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(modelFromUrl(String(url)));
      return errorResponse(403, JSON.stringify({ error: { message: "API key not valid" } }));
    }) as unknown as typeof fetch;

    const { error } = await settle(callGemini(SCHOOL_ID, "hi"));

    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).configIssue).toBe(true);
    // Retrying a bad key can never help, so exactly one request is made.
    expect(calls).toHaveLength(1);
  });

  it("surfaces a rate-limit message when every model is exhausted", async () => {
    global.fetch = jest.fn(async () => errorResponse(429)) as unknown as typeof fetch;

    const { error } = await settle(callGemini(SCHOOL_ID, "hi"));

    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).configIssue).toBe(false);
    expect((error as AiServiceError).message).toMatch(/usage limit/i);
  });
});
