/**
 * src/lib/soma-ai/config.ts
 *
 * Shared types and constants for Soma AI configuration.
 * Used by the API routes, the Gemini client, and the UI config panel.
 */

// ---------------------------------------------------------------------------
// Available Gemini models
// ---------------------------------------------------------------------------

export interface GeminiModel {
  id: string;
  label: string;
  description: string;
  /** Recommended for most use-cases (shown first in UI) */
  recommended?: boolean;
  /** Indicates a high-capability / premium model */
  premium?: boolean;
  /** Maximum output tokens this model supports */
  maxOutputTokens: number;
}

export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Fast, capable, and cost-effective. Best for everyday assistant tasks. Recommended for most schools.",
    recommended: true,
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Best price-performance for low-latency, high-volume tasks requiring reasoning.",
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    description: "Fastest and most budget-friendly. Good for simple, high-volume queries.",
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Most advanced model for complex analysis, deep reasoning, and long documents.",
    premium: true,
    maxOutputTokens: 8192,
  },
];

export const DEFAULT_MODEL_ID = "gemini-3.5-flash";

/**
 * Models that have been shut down by Google.
 * Any stored metadata using one of these gets silently remapped to the
 * current default at request time — never surfaces as a user-facing 404.
 */
export const DEPRECATED_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash":               DEFAULT_MODEL_ID,
  "gemini-2.0-flash-lite":          DEFAULT_MODEL_ID,
  "gemini-2.5-flash-preview-05-20": "gemini-2.5-flash",
  "gemini-2.5-pro-preview-06-05":   "gemini-2.5-pro",
  "gemini-3.1-flash-lite-preview":  "gemini-2.5-flash-lite",
  "gemini-3-pro-preview":           "gemini-2.5-pro",
};

/** Resolve a stored model id — remaps deprecated/shut-down models to their replacement. */
export function resolveModelId(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_MODEL_ID;
  return DEPRECATED_MODEL_MAP[stored] ?? stored;
}

// ---------------------------------------------------------------------------
// AI configuration shape
// ---------------------------------------------------------------------------

export interface AiConfig {
  /** Gemini model id */
  model: string;
  /** Generation temperature: 0 = deterministic, 1 = creative, 2 = very creative */
  temperature: number;
  /** Max tokens in the response */
  maxOutputTokens: number;
  /** Master AI enable/disable switch */
  enabled: boolean;
  /** Cache identical prompts to reduce API calls */
  cacheEnabled: boolean;
  /** Cache TTL in minutes */
  cacheTtlMinutes: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  model: DEFAULT_MODEL_ID,
  temperature: 0.4,
  maxOutputTokens: 2048,
  enabled: true,
  cacheEnabled: true,
  cacheTtlMinutes: 15,
};

// ---------------------------------------------------------------------------
// Usage stats shape (stored in metadata)
// ---------------------------------------------------------------------------

export interface AiUsage {
  totalRequests: number;
  lastUsedAt: string | null;
}

// ---------------------------------------------------------------------------
// Query intent classification
// ---------------------------------------------------------------------------

/**
 * How a Soma AI message should be handled:
 *   "db"      — answered directly from the database (no Gemini spend)
 *   "gemini"  — requires natural language reasoning / Gemini
 *   "hybrid"  — fetch data from DB then pass it to Gemini for analysis
 *   "help"    — how-to question; resolved against the curated help-content
 *               knowledge base before any DB or Gemini call is made
 */
export type QueryIntent = "db" | "gemini" | "hybrid" | "help";

export interface ClassifiedQuery {
  intent: QueryIntent;
  /** Human-readable reason — used for logging/debugging */
  reason: string;
  /** For "db" intent: the category of lookup to perform */
  dbCategory?: DbCategory;
}

export type DbCategory =
  | "student_count"
  | "attendance_today"
  | "attendance_summary"
  | "class_list"
  | "subject_list"
  | "teacher_list"
  | "exam_periods"
  | "recent_results"
  | "school_info";
