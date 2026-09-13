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
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Fast, capable, and cost-effective. Best for everyday assistant tasks. Recommended for most schools.",
    recommended: true,
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-flash-lite-preview-06-17",
    label: "Gemini 2.5 Flash Lite",
    description: "Ultra-fast and lightweight. Best for simple queries at very high volume.",
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Highest capability model for complex analysis, long documents, and advanced reasoning.",
    premium: true,
    maxOutputTokens: 8192,
  },
];

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

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
