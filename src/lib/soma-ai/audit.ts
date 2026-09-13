/**
 * src/lib/soma-ai/audit.ts
 *
 * Audit logging for Soma AI interactions.
 *
 * Every query — whether answered from the database or via Gemini — writes
 * a row to AuditLog with action='SOMA_AI_QUERY'. The detail JSON records:
 *   - userId and role of the requester
 *   - intent classification (db / gemini / hybrid)
 *   - which module/data category was accessed
 *   - execution time in milliseconds
 *   - outcome (success / denied / error)
 *   - the raw user message (first 500 chars, no response text stored)
 *
 * The raw message is truncated and never includes AI response content —
 * this keeps audit log size manageable while preserving accountability.
 *
 * Writes are fire-and-forget (never block the SSE stream). Failures are
 * caught and logged to stderr — an audit write failure never surfaces to
 * the user.
 */

import { prisma } from "@/lib/prisma";
import type { QueryIntent, DbCategory } from "./config";
import type { HelpResolveOutcome } from "./help";

export type AuditOutcome = "success" | "denied" | "error" | "db_answer" | "cached";

export interface SomaAIAuditEntry {
  userId: string;
  schoolId: string;
  userRole: string;
  message: string;           // user's raw message, truncated to 500 chars
  intent: QueryIntent;
  dbCategory?: DbCategory;
  module?: string;           // e.g. "attendance", "marks", "library"
  executionMs: number;
  outcome: AuditOutcome;
  errorSummary?: string;     // brief error description if outcome=error
  /**
   * For intent="help" queries only: how the help resolver handled it.
   *   "confident"      — single match returned, zero Gemini spend
   *   "disambiguation" — multiple close matches, asked user to clarify
   *   "no_match"       — below threshold, fell through to Gemini
   * Undefined for non-help intents.
   */
  helpOutcome?: HelpResolveOutcome;
  /** When helpOutcome="confident": the id of the entry that was served. */
  helpEntryId?: string;
}

/**
 * Fire-and-forget audit log write. Never awaited by the caller.
 */
export function logSomaAIInteraction(entry: SomaAIAuditEntry): void {
  const detail = {
    userId: entry.userId,
    userRole: entry.userRole,
    intent: entry.intent,
    dbCategory: entry.dbCategory ?? null,
    module: entry.module ?? null,
    executionMs: entry.executionMs,
    outcome: entry.outcome,
    messageSample: entry.message.slice(0, 500),
    errorSummary: entry.errorSummary ?? null,
    helpOutcome: entry.helpOutcome ?? null,
    helpEntryId: entry.helpEntryId ?? null,
    ts: new Date().toISOString(),
  };

  prisma.auditLog
    .create({
      data: {
        schoolId: entry.schoolId,
        action: "SOMA_AI_QUERY",
        detail,
        performedById: entry.userId,
      },
    })
    .catch((err: unknown) => {
      console.error("[soma-ai/audit] Failed to write audit log:", err);
    });
}

/**
 * Convenience: wrap an async operation, measure it, and emit the audit entry.
 * Returns the value from fn or throws — never swallows errors.
 */
export async function withAudit<T>(
  base: Omit<SomaAIAuditEntry, "executionMs" | "outcome" | "errorSummary">,
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    logSomaAIInteraction({
      ...base,
      executionMs: Date.now() - t0,
      outcome: "success",
    });
    return result;
  } catch (err) {
    const errorSummary = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    logSomaAIInteraction({
      ...base,
      executionMs: Date.now() - t0,
      outcome: "error",
      errorSummary,
    });
    throw err;
  }
}
