/**
 * src/lib/timetable/regenerationController.ts
 *
 * Orchestration layer between the API routes and the CP-SAT solver.
 * Calls the solver, runs the post-generation validator, and wraps the
 * result in the RegenerationResult shape the routes expect.
 *
 * The CP-SAT solver is a complete solver — it either finds a feasible
 * solution in one call or proves the problem is infeasible.  No retry
 * loop is used.  generateWithValidation() preserves its original signature
 * so both API routes work without modification.
 */

import { validateTimetable, type ValidationReport } from "./validator";
import type { ValidatorInput } from "./validator";
import type { EngineResult } from "./deterministicEngine";
import { generateTimetableViaCpSat, isSolverHealthy, type CpSatInput } from "./cpSatEngine";

// ─── Public types ────────────────────────────────────────────────────────────

export type RegenerationConfig = {
  maxAttempts: number;        // kept for API compatibility; CP-SAT ignores this
  timeoutMs: number;          // forwarded to CP-SAT as timeLimitSeconds
  onAttempt?: (attempt: number, result: EngineResult, validation: ValidationReport) => void;
  onSuccess?: (attempt: number, result: EngineResult, validation: ValidationReport) => void;
  onFailure?: (attempts: number, lastValidation: ValidationReport) => void;
};

export type RegenerationResult = {
  success: boolean;
  attempts: number;
  finalResult: EngineResult | null;
  finalValidation: ValidationReport | null;
  aborted: boolean;
  reason?: string;
  history: Array<{
    attempt: number;
    valid: boolean;
    errors: number;
    warnings: number;
  }>;
};

const DEFAULT_CONFIG: RegenerationConfig = {
  maxAttempts: 1,       // CP-SAT only needs one attempt
  timeoutMs: 55_000,    // 55 s wall-clock budget for the solver (leaves headroom for DB save)
};

// ─── generateWithValidation ─────────────────────────────────────────────────

/**
 * Generate a timetable via the CP-SAT solver, then validate the result.
 *
 * @param engineInput  CP-SAT solver input, including config (templateColumns, operatingDays).
 * @param validatorInput  Validator base — all fields except slots, which are filled from the result.
 * @param config  Optional overrides for timeout and lifecycle callbacks.
 */
export async function generateWithValidation(
  engineInput: CpSatInput,
  validatorInput: Omit<ValidatorInput, "slots">,
  config: Partial<RegenerationConfig> = {}
): Promise<RegenerationResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Health-check the solver before committing (fast, ~100 ms)
  const healthy = await isSolverHealthy(5_000);
  if (!healthy) {
    const emptyValidation = _emptyValidation("CP-SAT solver service is not reachable. Start the solver with: cd timetable-solver && python solver.py");
    mergedConfig.onFailure?.(0, emptyValidation);
    return {
      success: false,
      attempts: 0,
      finalResult: null,
      finalValidation: emptyValidation,
      aborted: true,
      reason: "Solver service unreachable",
      history: [],
    };
  }

  // Call CP-SAT solver (single attempt — no retry loop needed)
  const solverResult = await generateTimetableViaCpSat({
    ...engineInput,
    timeLimitSeconds: Math.floor(mergedConfig.timeoutMs / 1_000),
  });

  // Run the post-generation validator so the API can surface rule violations
  // to the admin as informational feedback.
  const validation = validateTimetable({
    ...validatorInput,
    slots: solverResult.slots,
  });

  const historyEntry = {
    attempt: 1,
    valid: validation.valid,
    errors: validation.summary.errors,
    warnings: validation.summary.warnings,
  };

  mergedConfig.onAttempt?.(1, solverResult, validation);

  // We succeed whenever the solver ran and placed at least one lesson — or
  // even zero lessons (which is reported as a teacher-shortage warning rather
  // than a hard crash).  Validation failures are surfaced as warnings so the
  // admin can see exactly what couldn't be scheduled; they do not prevent the
  // draft from being saved.
  //
  // The only true failure is when the solver service itself was unreachable
  // (solverResult.success === false AND slots is empty due to a comms error).
  const solverCrashed =
    !solverResult.success && solverResult.slots.length === 0;

  if (solverCrashed) {
    mergedConfig.onFailure?.(1, validation);
    return {
      success: false,
      attempts: 1,
      finalResult: solverResult,
      finalValidation: validation,
      aborted: false,
      reason: solverResult.errors[0]?.description ?? "Solver service error — no lessons could be placed",
      history: [historyEntry],
    };
  }

  // Partial or full success — promote validation errors (except
  // COMPLETE_LESSON_COUNT) to warnings so they are visible in the UI without
  // blocking the save.  COMPLETE_LESSON_COUNT issues are already covered by
  // the engine's own shortfall strings in the Warnings section (e.g.
  // "Could not place lesson for X in Y"), so we exclude them here to avoid
  // showing the same missed-lesson information twice.
  const promotedWarnings = [
    ...solverResult.warnings,
    ...validation.issues
      .filter((i) => i.severity === "ERROR" && i.rule !== "COMPLETE_LESSON_COUNT")
      .map((i) => `Validation: ${i.message}`),
  ];

  const enrichedResult: typeof solverResult = {
    ...solverResult,
    success: true,
    warnings: promotedWarnings,
  };

  mergedConfig.onSuccess?.(1, enrichedResult, validation);
  return {
    success: true,
    attempts: 1,
    finalResult: enrichedResult,
    finalValidation: validation,
    aborted: false,
    history: [historyEntry],
  };
}

// ─── quickValidate (unchanged) ───────────────────────────────────────────────

/**
 * Run the validator against an existing set of slots without generating.
 */
export function quickValidate(
  slots: Parameters<typeof validateTimetable>[0]["slots"],
  validatorInput: Omit<ValidatorInput, "slots">
): ValidationReport {
  return validateTimetable({ ...validatorInput, slots });
}

// ─── analyzeValidationFailure (unchanged) ───────────────────────────────────

export function analyzeValidationFailure(
  validation: ValidationReport
): Array<{
  issue: string;
  suggestion: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}> {
  const suggestions: Array<{
    issue: string;
    suggestion: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }> = [];

  const issuesByRule = new Map<string, number>();
  for (const issue of validation.issues) {
    if (issue.severity === "ERROR") {
      issuesByRule.set(issue.rule, (issuesByRule.get(issue.rule) ?? 0) + 1);
    }
  }

  for (const [rule, count] of issuesByRule) {
    switch (rule) {
      case "COMPLETE_LESSON_COUNT":
        suggestions.push({
          issue: `${count} classes have incomplete lesson counts`,
          suggestion:
            "Increase maxLessonsPerTeacherPerDay, reduce weekly lesson requirements, or relax teacher unavailability",
          priority: "HIGH",
        });
        break;

      case "TEACHER_ASSIGNMENT_INTEGRITY":
        suggestions.push({
          issue: `${count} slots have incorrect teacher assignments`,
          suggestion:
            "Review ClassSubjectTeacher assignments. Each (class, subject) pair must have exactly one teacher.",
          priority: "HIGH",
        });
        break;

      case "SESSION_CONSTRAINTS":
        suggestions.push({
          issue: `${count} hard session preferences could not be satisfied`,
          suggestion:
            "Change hard session preferences to soft, or add more lesson slots in the preferred session in the day template",
          priority: "MEDIUM",
        });
        break;

      case "TEACHER_AVAILABILITY":
        suggestions.push({
          issue: `${count} teachers scheduled during unavailable periods`,
          suggestion:
            "Review teacher unavailability settings or assign additional teachers",
          priority: "HIGH",
        });
        break;

      case "NO_TEACHER_DOUBLE_BOOKING":
      case "NO_CLASS_DOUBLE_BOOKING":
        suggestions.push({
          issue: "Double-booking detected in solver output",
          suggestion:
            "This should not occur with CP-SAT. Please report to the system administrator with the validation report.",
          priority: "HIGH",
        });
        break;

      default:
        suggestions.push({
          issue: `${count} violations of rule: ${rule}`,
          suggestion: "Review the full validation report for details",
          priority: "MEDIUM",
        });
    }
  }

  return suggestions;
}

// ─── checkFeasibility (unchanged) ───────────────────────────────────────────

export function checkFeasibility(
  validatorInput: Omit<ValidatorInput, "slots">
): {
  feasible: boolean;
  warnings: string[];
  blockingIssues: string[];
} {
  const warnings: string[] = [];
  const blockingIssues: string[] = [];

  if (validatorInput.classes.length === 0) {
    blockingIssues.push("No classes defined");
  }
  if (validatorInput.subjects.length === 0) {
    blockingIssues.push("No subjects defined");
  }
  if (validatorInput.teachers.length === 0) {
    blockingIssues.push("No teachers defined");
  }
  if (validatorInput.requirements.length === 0) {
    warnings.push("No lesson requirements defined — timetable will be empty");
  }

  for (const req of validatorInput.requirements) {
    const hasAssignment = validatorInput.teacherAssignments.some(
      (a) => a.classId === req.classId && a.subjectId === req.subjectId
    );
    if (!hasAssignment) {
      const cls = validatorInput.classes.find((c) => c.id === req.classId);
      const subject = validatorInput.subjects.find((s) => s.id === req.subjectId);
      warnings.push(
        `${cls?.name ?? req.classId} needs ${subject?.code ?? req.subjectId} but no teacher is assigned`
      );
    }
  }

  const lessonSlots = validatorInput.templateColumns.filter(
    (col) => col.slotType === "LESSON"
  );
  if (lessonSlots.length === 0) {
    blockingIssues.push("Template has no lesson slots defined");
  }

  const totalCapacity =
    lessonSlots.length *
    validatorInput.operatingDays.length *
    validatorInput.classes.length;

  const totalRequired = validatorInput.requirements.reduce(
    (sum, req) => sum + req.lessonsPerWeek,
    0
  );

  if (totalRequired > totalCapacity) {
    blockingIssues.push(
      `Total required lessons (${totalRequired}) exceeds available capacity (${totalCapacity})`
    );
  } else if (totalRequired > totalCapacity * 0.9) {
    warnings.push(
      `Timetable is very tight: ${totalRequired}/${totalCapacity} slots required (${Math.round((totalRequired / totalCapacity) * 100)}% utilisation)`
    );
  }

  return { feasible: blockingIssues.length === 0, warnings, blockingIssues };
}

// ─── formatRegenerationResult (unchanged) ───────────────────────────────────

export function formatRegenerationResult(result: RegenerationResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(`✓ Success (CP-SAT solved in 1 attempt)`);
  } else {
    lines.push(`✗ Failed after ${result.attempts} attempt(s)`);
    if (result.reason) lines.push(`Reason: ${result.reason}`);
  }

  lines.push("");
  lines.push("Attempt History:");
  for (const entry of result.history) {
    const status = entry.valid ? "✓" : "✗";
    lines.push(
      `  ${status} Attempt ${entry.attempt}: ${entry.errors} errors, ${entry.warnings} warnings`
    );
  }

  return lines.join("\n");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _emptyValidation(message: string): ValidationReport {
  return {
    valid: false,
    passedRules: [],
    failedRules: ["COMPLETE_LESSON_COUNT"],
    issues: [
      {
        rule: "COMPLETE_LESSON_COUNT",
        severity: "ERROR",
        message,
      },
    ],
    summary: {
      totalChecks: 1,
      passed: 0,
      failed: 1,
      errors: 1,
      warnings: 0,
    },
    timestamp: new Date(),
  };
}
