# Requirements Document

## Introduction

This feature upgrades the CP-SAT timetable engine from its current single-pass, scalarized-objective state to a best-in-class, production-hardened constraint solver. The upgrade is delivered in four phases:

- **Phase 0** — Regression safety net: pytest and Jest test suites covering solver correctness, client payload mapping, and controller failure paths.
- **Phase 1** — Route unification: point the remaining two API routes (`reoptimize` and `batch AUTO_FIX`) at the CP-SAT path, and add `lockedSlots` support so re-optimisation preserves pinned lessons.
- **Phase 2** — Warm start and determinism: replace the blanket all-ones hint with a constructive greedy heuristic, pin the random seed for reproducibility, and add an optional `previousSlots` stability objective.
- **Phase 3** — True priority ordering and teacher-gap minimisation: replace the single scalarized objective with sequential lexicographic solves, add an explicit teacher idle-period penalty, and expose per-tier statistics.

Throughout all phases the seven hard constraints enumerated in the current solver (no teacher double-booking, no class double-booking, teacher unavailability, adaptive daily cap, valid double-lesson adjacency, linked-class-group sync, consecutive-lesson limits) must be preserved without regression.

---

## Glossary

- **Solver**: The Python FastAPI microservice (`timetable-solver/solver.py`) that runs the OR-Tools CP-SAT engine.
- **CpSatEngine**: The TypeScript client module (`src/lib/timetable/cpSatEngine.ts`) that serialises requests to the Solver and deserialises responses.
- **RegenerationController**: The TypeScript orchestration module (`src/lib/timetable/regenerationController.ts`) that calls CpSatEngine and runs the post-generation validator.
- **DeterministicEngine**: The legacy greedy scheduler (`src/lib/timetable/deterministicEngine.ts`). It remains in the codebase but its `generateTimetable` function is deprecated after Phase 1.
- **SolverRequest**: The Pydantic request model that the Solver's `POST /solve` endpoint accepts.
- **SolverResponse**: The Pydantic response model that `POST /solve` returns.
- **LockedSlot**: A `{classId, subjectId, dayOfWeek, period}` tuple representing a timetable slot that must not be moved. Hard-fixed in the CP-SAT model via `model.add(x == 1)`.
- **PreviousSlot**: A `{classId, subjectId, dayOfWeek, period}` tuple from a prior timetable version, used as a soft stability bias.
- **LinkedClassGroup**: A set of classes that must have every shared elective subject scheduled at the same `(dayOfWeek, period)` simultaneously.
- **ValidDoubleStart**: A lesson-period index `p` where `p` and `p+1` are adjacent in the template (no non-LESSON column between them). Double lessons may only be placed at valid double starts.
- **AdaptiveCap**: The effective daily lesson cap for a teacher, raised above `maxLessonsPerTeacherPerDay` when the teacher's total weekly load cannot fit within the configured cap.
- **ClusterRepresentative**: One variable selected per pooled-session cluster (via union-find) to represent the cluster in teacher double-booking and daily-cap constraints.
- **Tier1Objective**: The first lexicographic solve objective: maximise coverage (P1 + P2 — requirement completion and per-lesson placement).
- **Tier2Objective**: The second lexicographic solve objective: minimise teacher idle periods strictly between a teacher's first and last lesson on each day.
- **IdlePeriod**: A period between a teacher's first and last lesson on a given day on which that teacher has no scheduled lesson. Does not include periods before the first or after the last lesson.
- **StabilityObjective**: A soft objective term (weight 1) that rewards placing a lesson at the same `(classId, subjectId, dayOfWeek, period)` as the previous timetable version.
- **GreedyHint**: A constructive pre-solve assignment produced by sorting requirements by scarcity and greedily allocating to the first non-conflicting slot, used to initialise the solver's hint variables.

---

## Requirements

### Requirement 1 — Python Regression Test Suite (Phase 0)

**User Story:** As a developer, I want a pytest suite that covers the critical correctness properties of the CP-SAT solver directly, so that any regression introduced by future changes is detected before deployment.

#### Acceptance Criteria

1. THE test suite SHALL reside in `timetable-solver/tests/` and invoke `_solve()` directly without going through the HTTP layer.

2. WHEN a property-style test generates N random small-school inputs (at minimum N = 20 randomly seeded combinations of 2–4 classes, 3–6 subjects, 2–4 teachers, and a 5-period × 5-day template), THE test suite SHALL assert that no two output slots share the same `(teacherId, dayOfWeek, period)` unless both slots belong to the same `LinkedClassGroup` subject cluster at that slot.

3. WHEN a property-style test generates N random small-school inputs, THE test suite SHALL assert that no two output slots share the same `(classId, dayOfWeek, period)`.

4. WHEN a `SolverRequest` contains a `LinkedClassGroup` with two classes where the assigned teacher for one class has unavailability that restricts common slot count below the required lessons-per-week, THE Solver SHALL emit a warning string matching `"Group sync:"` and SHALL return a `SolverResponse` with `status == "FEASIBLE"` and zero or fewer common slots placed than required.

5. WHEN a template places a `BREAK` or `LUNCH` column between two `LESSON` columns at positions `p` and `p+2`, THE Solver SHALL never produce an output slot pair where a double-lesson subject has `period == p` for one slot and `period == p+1` for the adjacent slot if those lesson-column indices are not in `valid_double_starts`.

6. WHEN a `SolverRequest` sets `maxConsecutiveLessons = 2`, THE Solver SHALL never produce output where a single class has three or more lessons in consecutive periods on the same day.

7. WHEN a `SolverRequest` sets `preventUnintendedDoubles = true` and a subject has `doubleLesson = false`, THE Solver SHALL never produce output where that subject occupies two consecutive periods for the same class on the same day.

8. WHEN a teacher's total weekly lesson load exceeds `maxLessonsPerTeacherPerDay × len(operatingDays)`, THE Solver SHALL raise the per-teacher daily cap to `ceil(total / len(operatingDays))` and SHALL include a warning string containing `"cap raised"` in the response.

9. WHEN the `SolverResponse` contains shortfall warnings, THE `placed` count reported in each warning SHALL equal the number of output slots for that `(classId, subjectId)` pair (divided by 2 for double-lesson subjects), and the `shortfall` SHALL equal `lessonsPerWeek − placed`.

10. WHEN a `SolverRequest` contains a `SessionPreference` with `isHard = false` and the only available slots for that subject are in the wrong session, THE Solver SHALL still place the lesson and SHALL NOT reduce placement count below what would be achieved if the preference were absent.

### Requirement 2 — TypeScript CpSatEngine Unit Tests (Phase 0)

**User Story:** As a developer, I want Jest tests for `cpSatEngine.ts` covering payload serialisation and response deserialisation, so that wire-contract regressions are caught automatically.

#### Acceptance Criteria

1. THE test file SHALL reside at `src/__tests__/timetable/cpSatEngine.test.ts` and use Jest with ts-jest.

2. WHEN `generateTimetableViaCpSat` is called with a `CpSatInput` that has non-empty `linkedClassGroups`, `maxConsecutiveLessons`, and `preventUnintendedDoubles` fields, THE CpSatEngine SHALL serialise a `SolverRequest` body where every `CpSatInput` field maps to its corresponding `SolverRequest` field with no data loss.

3. WHEN the mocked Solver returns `status: "OPTIMAL"`, THE CpSatEngine SHALL return an `EngineResult` with `success: true` and a non-empty `slots` array.

4. WHEN the mocked Solver returns `status: "FEASIBLE"`, THE CpSatEngine SHALL return an `EngineResult` with `success: true`.

5. WHEN the mocked Solver returns `status: "UNKNOWN"` and `slots: []`, THE CpSatEngine SHALL return an `EngineResult` with `success: true`, `slots: []`, and a `warnings` array containing a string that includes `"time limit"`.

6. WHEN the mocked Solver returns `status: "UNKNOWN"` and `slots: []`, THE CpSatEngine SHALL return an `EngineResult` where `stats.completionRate === 0` and `stats.classesNotScheduled === input.classes.length`.

7. WHEN `generateTimetableViaCpSat` is called and the fetch call throws a network error, THE CpSatEngine SHALL return an `EngineResult` with `success: false` and `errors[0].type === "TEACHER_ASSIGNMENT_VIOLATION"`.

8. WHEN the mocked Solver returns `stats` fields `totalLessonsScheduled` and `totalLessonsRequired`, THE CpSatEngine SHALL use those values directly rather than recomputing them from the slots array.

### Requirement 3 — TypeScript RegenerationController Unit Tests (Phase 0)

**User Story:** As a developer, I want Jest tests for `regenerationController.ts` covering failure paths, so that degraded-service behaviour is verified without a live solver.

#### Acceptance Criteria

1. THE test file SHALL reside at `src/__tests__/timetable/regenerationController.test.ts` and use Jest with ts-jest.

2. WHEN `isSolverHealthy` returns `false`, THE RegenerationController SHALL return a `RegenerationResult` with `success: false`, `aborted: true`, `attempts: 0`, and `reason` containing `"unreachable"`.

3. WHEN `generateTimetableViaCpSat` returns `{ success: false, slots: [] }` (solver crash path), THE RegenerationController SHALL return a `RegenerationResult` with `success: false`, `aborted: false`, and `attempts: 1`.

4. WHEN `generateTimetableViaCpSat` returns `{ success: true }` but the post-generation validator reports `ERROR`-severity issues, THE RegenerationController SHALL return a `RegenerationResult` with `success: true` and SHALL include those validation errors promoted to the `finalResult.warnings` array as strings prefixed with `"Validation: "`.

5. WHEN `generateWithValidation` succeeds, THE RegenerationController SHALL always call `onSuccess` callback with `attempt === 1`.

### Requirement 4 — Locked-Slot Support in Solver (Phase 1)

**User Story:** As a school administrator, I want re-optimisation to preserve lessons I have manually pinned, so that my manual adjustments are never overwritten by a re-generate operation.

#### Acceptance Criteria

1. THE SolverRequest model SHALL include a `lockedSlots` field typed as `list[LockedSlot]` with a default empty list, where `LockedSlot` has fields `classId: str`, `subjectId: str`, `dayOfWeek: int`, and `period: int`.

2. WHEN `lockedSlots` is absent from an incoming JSON request, THE Solver SHALL treat it as an empty list and produce a response identical to the pre-Phase-1 behaviour.

3. WHEN `lockedSlots` is non-empty, THE Solver SHALL, for each locked slot, add a hard constraint `model.add(x[(classId, subjectId, d_idx, period-1)] == 1)` after the decision variables are built in `_solve()`.

4. WHEN a locked slot's decision variable does not exist (the teacher is unavailable at that slot), THE Solver SHALL emit a warning string containing `"locked slot"` and SHALL skip the hard-fix constraint for that slot.

5. WHEN locked slots count toward occupancy for a `(classId, subjectId)` pair, THE caller (route handler) SHALL subtract the locked count from `lessonsPerWeek` before including the requirement in the `SolverRequest.requirements` list, so the Solver does not double-count locked lessons.

6. THE `CpSatInput` type in `cpSatEngine.ts` SHALL include a `lockedSlots` field typed as `Array<{ classId: string; subjectId: string; dayOfWeek: number; period: number }>` with a default empty array.

7. THE `SolverRequest` wire type in `cpSatEngine.ts` SHALL include a `lockedSlots` field of the same shape, and `generateTimetableViaCpSat` SHALL serialise `input.lockedSlots ?? []` into the request body.

### Requirement 5 — Route Unification onto CP-SAT (Phase 1)

**User Story:** As a school administrator, I want re-optimisation and batch AUTO_FIX operations to use the same CP-SAT engine as fresh generation, so that timetable quality is consistent across all generation pathways.

#### Acceptance Criteria

1. THE `reoptimize` route (`src/app/api/timetable/v2/versions/[id]/reoptimize/route.ts`) SHALL call `generateWithValidation` (from `regenerationController.ts`) instead of `generateTimetable` (from `deterministicEngine.ts`).

2. WHEN the `reoptimize` route constructs the solver input, THE route SHALL pass locked slots (slots where `isLocked === true` in the current version) as a `lockedSlots` array in the `CpSatInput`, and SHALL subtract the locked count for each `(classId, subjectId)` pair from `lessonsPerWeek` in `requirements`.

3. THE `batch` route AUTO_FIX operation (`src/app/api/timetable/v2/versions/[id]/batch/route.ts`) SHALL call `generateWithValidation` instead of `generateTimetable` for the AUTO_FIX operation type.

4. WHEN the `batch` AUTO_FIX operation constructs the solver input, THE route SHALL pass slots belonging to other (non-target) classes as teacher unavailability in the `CpSatInput`, preserving the isolation logic present in the current implementation.

5. THE `deterministicEngine.generateTimetable` function SHALL have a JSDoc `@deprecated` annotation pointing callers to `generateTimetableViaCpSat` as the replacement.

6. THE `deterministicEngine.ts` module and its associated tests SHALL NOT be deleted.

7. IF the CP-SAT solver is unreachable when `reoptimize` or `batch AUTO_FIX` is called, THEN THE route SHALL return an HTTP 422 response with a `error` field that includes the string `"solver"` and a `hint` field describing how to start the solver service.

### Requirement 6 — Constructive Greedy Warm-Start Heuristic (Phase 2)

**User Story:** As a developer, I want the solver to start from a high-quality initial assignment rather than an all-ones optimistic hint, so that it finds good solutions faster and produces fewer wasted search iterations.

#### Acceptance Criteria

1. WHEN `_solve()` is invoked, THE Solver SHALL replace the blanket `model.add_hint(v, 1)` loop (Section 10 of the current implementation) with a constructive greedy heuristic that produces a partial assignment before hinting.

2. THE greedy heuristic SHALL sort requirements by ascending candidate-variable count (fewest legal slots first) to naturally prioritise teacher-shortage subjects.

3. THE greedy heuristic SHALL iterate requirements in scarcity order and for each requirement assign each needed occurrence to the first non-conflicting slot (no class or teacher conflict at that `(d_idx, period)`), skipping any slot that is already taken.

4. AFTER the greedy pass, THE Solver SHALL call `model.add_hint(v, 1)` for every decision variable assigned by the greedy pass and `model.add_hint(v, 0)` for all remaining candidate variables of each assigned requirement.

5. THE Solver SHALL set `solver.parameters.random_seed = 42` before calling `solver.solve(model)`, so that identical inputs always produce identical search paths and output.

### Requirement 7 — Previous-Slots Stability Objective (Phase 2)

**User Story:** As a school administrator, I want re-generating a draft timetable to keep as many existing lesson placements as possible, so that incremental changes minimise disruption for teachers and students.

#### Acceptance Criteria

1. THE `SolverRequest` Pydantic model SHALL include a `previousSlots` field typed as `list[PreviousSlot]` with a default empty list, where `PreviousSlot` has fields `classId: str`, `subjectId: str`, `dayOfWeek: int`, and `period: int`.

2. WHEN `previousSlots` is absent from an incoming JSON request, THE Solver SHALL treat it as an empty list and produce a response identical to the pre-Phase-2 behaviour for that field.

3. WHEN `previousSlots` is non-empty, THE Solver SHALL add a stability objective term with weight 1 (lower than the P5 load-balance weight of 2) that adds `+1` for each decision variable `x[(classId, subjectId, d_idx, period-1)]` that matches a `previousSlots` entry and exists in the model.

4. THE stability objective term SHALL be included in the same `model.maximize(...)` call as the existing P1–P5 terms.

5. THE `CpSatInput` type in `cpSatEngine.ts` SHALL include a `previousSlots` optional field typed as `Array<{ classId: string; subjectId: string; dayOfWeek: number; period: number }>`.

6. THE `SolverRequest` wire type in `cpSatEngine.ts` SHALL include a matching `previousSlots` field, and `generateTimetableViaCpSat` SHALL serialise `input.previousSlots ?? []` into the request body.

7. WHEN `previousSlots` is empty or absent, THE Solver SHALL produce a timetable with coverage metrics no worse than the timetable produced before Phase 2 on identical inputs.

### Requirement 8 — Sequential Lexicographic Solves (Phase 3)

**User Story:** As a school administrator, I want lesson coverage to be maximised before teacher comfort is optimised, so that the solver never sacrifices a schedulable lesson just to reduce teacher idle time.

#### Acceptance Criteria

1. WHEN `_solve()` is called with a `timeLimitSeconds > 0`, THE Solver SHALL execute two sequential CP-SAT solves on the same model using the same set of decision variables.

2. THE first solve (Tier 1) SHALL maximise the sum of P1 (requirement-completion bonuses) and P2 (per-lesson placement rewards) within a time budget of `timeLimitSeconds × 0.6` seconds.

3. AFTER the Tier 1 solve completes, THE Solver SHALL add a hard constraint `sum(coverage_vars) >= achieved_coverage` where `achieved_coverage` is the number of `req_complete` variables that equal 1 in the Tier 1 solution.

4. THE second solve (Tier 2) SHALL minimise the teacher idle-period count within a time budget of `timeLimitSeconds × 0.35` seconds.

5. WHEN the Tier 1 solve does not find any feasible solution within its time budget, THE Solver SHALL skip the coverage-lock constraint and proceed directly to the Tier 2 solve with the full remaining budget, emitting a warning string containing `"Tier 1 time limit"`.

6. THE Solver SHALL return a `SolverResponse` with `status == "FEASIBLE"` regardless of which tier produced the final solution.

7. THE total wall time used by both solves SHALL be reported in `SolverResponse.stats.wallTime`.

### Requirement 9 — Teacher Idle-Period Minimisation (Phase 3)

**User Story:** As a teacher, I want my free periods to be consolidated at the edges of my working day rather than scattered in the middle, so that I have uninterrupted preparation time instead of many short gaps.

#### Acceptance Criteria

1. WHEN the Tier 2 solve is running, THE Solver SHALL compute, for each `(teacher, day)` pair, the set of physical lesson periods strictly between the teacher's first and last scheduled period on that day.

2. THE idle-period penalty SHALL count unoccupied physical periods in that interior range as penalty units, adding one BoolVar per `(teacher, day, period)` triple in the interior range that is not occupied by any lesson for that teacher.

3. THE idle-period computation SHALL use `_cluster_representatives` deduplication: pooled sessions where the same teacher teaches multiple classes simultaneously SHALL count as ONE occupied period per cluster, not one per class.

4. THE Tier 2 objective SHALL be `model.minimize(idle_period_count)`.

5. WHEN a teacher has zero or one lesson on a given day, THE Solver SHALL add zero idle-period penalty variables for that `(teacher, day)` pair.

### Requirement 10 — Per-Tier Statistics in SolverResponse (Phase 3)

**User Story:** As a developer and school administrator, I want the solver response to include detailed per-tier metrics, so that I can evaluate timetable quality across coverage, placement, and teacher comfort dimensions separately.

#### Acceptance Criteria

1. THE `SolverResponse.stats` dict SHALL include a `requirementsCompletionRate` key whose value is the fraction of requirements fully placed (all occurrences scheduled) expressed as a percentage, rounded to two decimal places.

2. THE `SolverResponse.stats` dict SHALL include a `lessonPlacementRate` key whose value is `totalLessonsScheduled / totalLessonsRequired × 100`, rounded to two decimal places (equivalent to the current `completionRate` field; both SHALL be present for backward compatibility).

3. THE `SolverResponse.stats` dict SHALL include an `avgTeacherGapsPerDay` key whose value is the total idle-period count across all teachers and days divided by the number of `(teacher, day)` pairs that have at least one lesson, rounded to two decimal places.

4. THE `SolverResponse.stats` dict SHALL include a `loadBalanceScore` key whose value is the sum of P5 balance variables that equal 1, divided by the total number of P5 balance variables, expressed as a percentage rounded to two decimal places.

5. THE `SolverResponse.stats` dict SHALL retain all existing keys (`totalLessonsScheduled`, `totalLessonsRequired`, `completionRate`, `wallTime`, `branches`, `conflicts`) with their current semantics so that existing callers continue to function without modification.

### Requirement 11 — Hard Constraint Preservation Across All Phases

**User Story:** As a school administrator, I want the solver to always produce a timetable that is free of double-bookings, respects unavailability, and honours linked-group sync, regardless of which phase or objective mode is active.

#### Acceptance Criteria

1. WHILE any phase modification is active, THE Solver SHALL never produce an output where two slots share the same `(teacherId, dayOfWeek, period)` unless both slots are part of the same `LinkedClassGroup` pooled session for the same subject.

2. WHILE any phase modification is active, THE Solver SHALL never produce an output where two slots share the same `(classId, dayOfWeek, period)`.

3. WHILE any phase modification is active, THE Solver SHALL never assign a teacher to a slot listed in that teacher's `teacherUnavailability`.

4. WHILE any phase modification is active, THE Solver SHALL enforce the adaptive daily cap so that no teacher's total physical lesson count on any single day exceeds `effective_cap_for[teacher]`.

5. WHILE any phase modification is active, THE Solver SHALL never produce a double-lesson slot where the two physical periods are not adjacent in the template (i.e., the lesson-column start index is not in `valid_double_starts`).

6. WHILE any phase modification is active, THE Solver SHALL enforce `LinkedClassGroup` synchronisation so that every class in a group has every group subject at the same `(dayOfWeek, period)`.

7. WHILE any phase modification is active and `maxConsecutiveLessons` is set, THE Solver SHALL enforce that no class has more than `maxConsecutiveLessons` consecutive occupied periods on any day.

8. WHILE any phase modification is active and `preventUnintendedDoubles` is `true`, THE Solver SHALL enforce that no non-double subject occupies two consecutive periods for the same class on the same day.

### Requirement 12 — Wire Contract Backward Compatibility

**User Story:** As a developer, I want all new request and response fields to have safe defaults, so that existing callers that do not send the new fields continue to work without modification.

#### Acceptance Criteria

1. THE `lockedSlots` field in `SolverRequest` SHALL default to an empty list so that a JSON body without this field is accepted and behaves identically to the pre-Phase-1 behaviour.

2. THE `previousSlots` field in `SolverRequest` SHALL default to an empty list so that a JSON body without this field is accepted and behaves identically to the pre-Phase-2 behaviour.

3. WHEN `lockedSlots` is an empty list, THE Solver SHALL produce a response with coverage metrics no worse than the response produced by the pre-Phase-1 solver on the same input.

4. WHEN `previousSlots` is an empty list, THE Solver SHALL produce a response with coverage metrics no worse than the response produced by the pre-Phase-2 solver on the same input.

5. THE new `SolverResponse.stats` keys (`requirementsCompletionRate`, `lessonPlacementRate`, `avgTeacherGapsPerDay`, `loadBalanceScore`) SHALL be present in every response and SHALL have numeric values, ensuring callers can always safely read them without a key-existence check.

6. IF a new stat key cannot be computed (e.g., no teachers have more than one lesson in a day), THEN THE Solver SHALL return `0.0` for that key rather than omitting it.

### Requirement 13 — Python Test Dependencies

**User Story:** As a developer, I want the Python test suite to have its dependencies declared in `requirements.txt`, so that they are installed consistently in CI and local environments.

#### Acceptance Criteria

1. THE file `timetable-solver/requirements.txt` SHALL include `pytest` and `httpx` as development dependencies, each pinned to a specific version.

2. WHEN a developer runs `pytest timetable-solver/tests/` from the workspace root, THE test suite SHALL discover and execute all tests without requiring any additional manual installation steps beyond `pip install -r timetable-solver/requirements.txt`.

3. THE `pytest` test files SHALL use `from solver import _solve, SolverRequest` imports that resolve correctly when the working directory is `timetable-solver/`.
