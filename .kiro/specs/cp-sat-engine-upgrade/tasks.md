# Implementation Plan: CP-SAT Engine Upgrade

## Overview

Upgrade the CP-SAT timetable engine through four phases: add a comprehensive Python and TypeScript test suite, add locked-slot pinning to the solver, upgrade the route layer to use `generateWithValidation` + `CpSatInput`, introduce a greedy warm-start and stability objective, then add a two-phase optimisation (coverage first, idle-period minimisation second) with per-tier telemetry.

## Tasks

- [x] 1. Add test infrastructure and Python test suite (Phase 0 — Python)
  - [x] 1.1 Pin pytest and httpx in requirements.txt
    - Add `pytest==8.3.5` and `httpx==0.27.2` to `timetable-solver/requirements.txt`
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.2 Create `timetable-solver/tests/conftest.py` with shared fixtures
    - Implement `make_template(n_lessons, break_positions=())` helper that builds a `SolverRequest`-compatible `templateColumns` list with LESSON columns and optional BREAK columns at the specified positions
    - Implement `minimal_school` pytest fixture: 2 classes, 2 subjects, 2 teachers, 5-day week, `templateColumns` from `make_template(8)`
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.3 Write `timetable-solver/tests/test_no_double_booking.py`
    - Import `_solve` directly from `solver`
    - Generate N ≥ 20 random `SolverRequest` fixtures using the `random` module (not Hypothesis)
    - For each solved result assert no `(teacherId, dayOfWeek, period)` triple appears more than once, except for pooled group sessions
    - Assert no `(classId, dayOfWeek, period)` triple appears more than once
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.4 Write `timetable-solver/tests/test_group_sync.py`
    - Build a `LinkedClassGroup` with 2 classes sharing 1 subject; give one class tighter teacher unavailability
    - Assert every placed slot for the group subject has the same `(dayOfWeek, period)` across both classes
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.5 Write `timetable-solver/tests/test_double_lesson_adjacency.py`
    - Build a template with a BREAK at position 2 (between lesson positions 1 and 3)
    - Configure one double-lesson subject
    - Assert no placed double-lesson slot spans that break (i.e. no slot has `period == 2` for the double subject when period 2 is a BREAK)
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.6 Write `timetable-solver/tests/test_consecutive_limits.py`
    - Configure 3 subjects for the same class, same teacher, with enough capacity to create a run of 3 consecutive periods if unconstrained
    - Assert no `(classId, dayOfWeek)` has 3 or more consecutive booked periods in the result
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.7 Write `timetable-solver/tests/test_adaptive_cap.py`
    - Configure a teacher needing 12 lessons over 5 days but `maxLessonsPerTeacherPerDay=6`
    - Assert that the returned `warnings` list contains at least one string with the text `"cap raised"`
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.8 Write `timetable-solver/tests/test_shortfall_reporting.py`
    - Configure a teacher with only 3 available slots but `lessonsPerWeek=5`
    - Solve and extract `placed` (slots for that teacher) and `shortfall` from warnings
    - Assert `placed + shortfall == lessonsPerWeek` (5)
    - _Requirements: Phase 0 — Python tests_

  - [x] 1.9 Write `timetable-solver/tests/test_session_preference_guard.py`
    - Build a template where all LESSON slots are `session="AFTERNOON"`
    - Add a `SessionPreference` for the subject with `preferredSession="MORNING"`, `isHard=False`
    - Require 3 lessons/week; assert all 3 are placed (session preference never causes a drop)
    - _Requirements: Phase 0 — Python tests_

- [x] 2. Add TypeScript unit tests (Phase 0 — TypeScript)
  - [x] 2.1 Write `src/__tests__/timetable/cpSatEngine.test.ts`
    - Mock `fetch` via `jest.spyOn(global, 'fetch')` — no network calls
    - Test that `generateTimetableViaCpSat` serialises all `CpSatInput` fields into the POST body (`subjects`, `classes`, `teachers`, `requirements`, `teacherAssignments`, `teacherUnavailability`, `sessionPreferences`, `templateColumns`, `operatingDays`, `maxLessonsPerTeacherPerDay`, `timeLimitSeconds`, `linkedClassGroups`, `maxConsecutiveLessons`, `preventUnintendedDoubles`)
    - Test `status="OPTIMAL"` response: `success=true`, slots mapped correctly
    - Test `status="FEASIBLE"` response: `success=true`
    - Test `status="UNKNOWN"` with empty slots: returns zero-slot success with extended warning
    - Test `status="INFEASIBLE"` with empty slots: returns `success=false`
    - Test solver HTTP error (non-ok response): returns `success=false` with descriptive error
    - Test fetch throw (network crash): returns `success=false`
    - _Requirements: Phase 0 — TypeScript tests_

  - [x] 2.2 Write `src/__tests__/timetable/regenerationController.test.ts`
    - `jest.mock('../../lib/timetable/cpSatEngine')` to stub `isSolverHealthy` and `generateTimetableViaCpSat`
    - Test `generateWithValidation` when solver is unhealthy: returns `success=false`, `aborted=true`
    - Test `generateWithValidation` when solver returns slots: returns `success=true`, `finalResult.slots` populated
    - Test `generateWithValidation` when solver crashes (empty slots, `success=false`): returns `success=false`, `aborted=false`
    - _Requirements: Phase 0 — TypeScript tests_

- [x] 3. Checkpoint — run existing and new tests
  - Ensure `pytest timetable-solver/tests/` passes (all 9 Python test files)
  - Ensure `jest src/__tests__/timetable/` passes (existing + 2 new TS files)
  - Ask the user if questions arise.

- [x] 4. Add `LockedSlot` pinning to solver and engine client (Phase 1)
  - [x] 4.1 Add `LockedSlot` Pydantic model and `lockedSlots` field to `SolverRequest` in `solver.py`
    - Define `class LockedSlot(BaseModel)` with fields: `classId: str`, `subjectId: str`, `dayOfWeek: int`, `period: int` (1-based)
    - Add `lockedSlots: list[LockedSlot] = Field(default_factory=list)` to `SolverRequest`, positioned before `linkedClassGroups`
    - _Requirements: Phase 1 — solver.py changes_

  - [x] 4.2 Implement §4b locked-slot hard-fixing in `_solve()` in `solver.py`
    - After §4 (`x` dict is fully built), add §4b block
    - Build `var_by_slot: dict[tuple, IntVar]` mapping `(classId, subjectId, dayOfWeek_actual, period_1based)` → `IntVar` by iterating over `x`
    - For each `LockedSlot`: look up the variable; if missing, emit `warnings.append(...)` containing the text `"locked slot"`; if found, add `model.add(v == 1)`
    - _Requirements: Phase 1 — solver.py changes_

  - [x] 4.3 Add `LockedSlotPin` type and fields to `CpSatInput` in `cpSatEngine.ts`
    - Export `type LockedSlotPin = { classId: string; subjectId: string; dayOfWeek: number; period: number }`
    - Add `lockedSlots?: LockedSlotPin[]` to `CpSatInput`
    - Add `previousSlots?: LockedSlotPin[]` to `CpSatInput` (wire type for Phase 2, types only — no serialisation yet)
    - Add `lockedSlots: SolverLockedSlot[]` to the internal `SolverRequest` wire type
    - Serialise `input.lockedSlots ?? []` into the `payload` in `generateTimetableViaCpSat`
    - _Requirements: Phase 1 — cpSatEngine.ts changes_

- [x] 5. Migrate route layer to CP-SAT (Phase 1 — Route migration)
  - [x] 5.1 Migrate `reoptimize/route.ts` to use `generateWithValidation` + `CpSatInput`
    - Remove `generateTimetable` import and `deterministicEngine` reference
    - Import `generateWithValidation` and `CpSatInput` from `regenerationController` / `cpSatEngine`
    - Build `CpSatInput` with `lockedSlots` populated from the existing `lockedSlots` array (mapped to `LockedSlotPin[]`): `{ classId, subjectId: s.subjectId, dayOfWeek: s.dayOfWeek, period: s.period }`
    - Call `generateWithValidation(cpSatInput, validatorInput)` and derive the diff from `regen.finalResult.slots`
    - Keep the diff-building, apply-transaction, and audit-log logic intact
    - _Requirements: Phase 1 — Route migration_

  - [x] 5.2 Migrate `batch/route.ts` AUTO_FIX handler to use `generateWithValidation` + `CpSatInput`
    - Remove `generateTimetable` import inside the AUTO_FIX block
    - Import and use `generateWithValidation` + `CpSatInput` with the same pattern as 5.1
    - Populate `lockedSlots` from any locked slots belonging to `op.classIds`
    - Keep all MOVE, DELETE, ADD handlers unchanged
    - _Requirements: Phase 1 — Route migration_

- [x] 6. Checkpoint — verify route migration builds and existing tests pass
  - Run `tsc --noEmit` (or equivalent) to confirm no TypeScript errors
  - Ensure `jest src/__tests__/timetable/` still passes
  - Ask the user if questions arise.

- [x] 7. Add greedy warm-start and stability objective (Phase 2)
  - [x] 7.1 Build `var_to_key` mapping in `_solve()` alongside §4 variable loop in `solver.py`
    - Add `var_to_key: dict[int, tuple] = {}` populated inside the §4 loop: `var_to_key[id(v)] = (cid, sid, d_idx, p)` for every new `IntVar`
    - _Requirements: Phase 2 — solver.py changes_

  - [x] 7.2 Add `PreviousSlot` Pydantic model and `previousSlots` field to `SolverRequest` in `solver.py`
    - Define `class PreviousSlot(BaseModel)` with fields: `classId: str`, `subjectId: str`, `dayOfWeek: int`, `period: int`
    - Add `previousSlots: list[PreviousSlot] = Field(default_factory=list)` to `SolverRequest`
    - _Requirements: Phase 2 — solver.py changes_

  - [x] 7.3 Add §9b greedy warm-start in `_solve()` before §10 in `solver.py`
    - Remove the blanket `model.add_hint(v, 1)` loop from §10
    - Add §9b before §10: iterate `req.previousSlots`; for each, look up the variable in `var_by_slot` (reuse dict from §4b); if found, call `model.add_hint(v, 1)`
    - For any remaining variable not hinted by previousSlots, call `model.add_hint(v, 1)` (preserving optimistic start for unconstrained variables)
    - Add `solver.parameters.random_seed = 42` in §10
    - _Requirements: Phase 2 — solver.py changes_

  - [x] 7.4 Add stability objective terms in §9 in `solver.py`
    - For each `PreviousSlot` in `req.previousSlots` that maps to a variable in `var_by_slot`, append `(v, 1)` to `objective_terms` (weight 1, so it never overrides P1–P5)
    - _Requirements: Phase 2 — solver.py changes_

  - [x] 7.5 Serialise `previousSlots` from `CpSatInput` into the solver payload in `cpSatEngine.ts`
    - Add `previousSlots: SolverPreviousSlot[]` to the internal `SolverRequest` wire type (same shape as `LockedSlotPin`)
    - Serialise `input.previousSlots ?? []` into `payload.previousSlots`
    - _Requirements: Phase 2 — cpSatEngine.ts changes_

- [x] 8. Add two-phase optimisation and per-tier telemetry (Phase 3)
  - [x] 8.1 Build idle-period BoolVars (§10a) in `_solve()` in `solver.py`
    - After all constraints and before the first solve call, add §10a
    - Build `has_lesson[(teacher_id, d_idx, p)]` BoolVars: `model.add_bool_or([*slot_vars, has_lesson_v.negated()])` and `model.add_implication(any_slot_v, has_lesson_v)` for each (teacher, day, period) bucket
    - Build `idle[(teacher_id, d_idx, p)]` BoolVars for periods sandwiched between two `has_lesson` periods on the same day: `model.add_implication(idle_v, has_lesson[(t, d, p-1)])` + `model.add_implication(idle_v, has_lesson[(t, d, p+1)])` + `model.add_implication(idle_v, has_lesson[(t, d, p)].negated())`
    - Collect all idle BoolVars into `idle_period_vars: list`
    - _Requirements: Phase 3 — solver.py changes_

  - [x] 8.2 Implement two-phase sequential solve in `_solve()` in `solver.py`
    - **Phase 1 solve** (60% of `timeLimitSeconds`): set maximize objective (existing P1–P5 + stability terms); call `solver.Solve(model)`; record `tier1_wall = solver.wall_time`; record `achieved_physical = sum(solver.value(v) for v in x.values())`
    - **Floor constraint**: `model.add(sum(x.values()) >= achieved_physical)` using the actual variable objects (not their values)
    - **Phase 2 solve** (35% of `timeLimitSeconds`): set `model.minimize(sum(idle_period_vars))`; set new time limit; call `solver.Solve(model)` on the same model; record `tier2_wall = solver.wall_time`
    - Update `status_code` / `feasible` from the Phase 2 solve
    - _Requirements: Phase 3 — solver.py changes_

  - [x] 8.3 Add per-tier stats to `SolverResponse` in `solver.py`
    - Extend the `stats` dict in the return value to include: `tier1WallTime`, `tier2WallTime`, `idlePeriodsMinimised` (count of idle vars equal to 0 in Phase 2 solution), `warmStartHints` (count of previousSlots that resolved to a variable), `lockedSlotsApplied` (count of locked slot constraints actually added)
    - _Requirements: Phase 3 — solver.py changes_

- [-] 9. Final checkpoint — full suite passes
  - Ensure `pytest timetable-solver/tests/` passes (all files including new Phase 2/3 paths)
  - Ensure `jest src/__tests__/timetable/` passes
  - Run `tsc --noEmit` to confirm zero TypeScript errors
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The Python solver uses OR-Tools CP-SAT; `CpModel` in the Python API has **no** `Clone()` method — two-phase optimization is done via two sequential `solver.Solve()` calls on the **same** `CpModel` instance
- `var_by_slot` (built in §4b) is keyed by `(classId, subjectId, dayOfWeek_actual, period_1based)` and is reused by both the locked-slot pinning (Phase 1) and the warm-start (Phase 2)
- The floor constraint in Phase 3 must reference the actual `IntVar` objects from `x`, not their integer values, so the model stays a proper MIP
- Tasks 1.3–1.9 import `_solve` directly (bypassing FastAPI) for speed; they do not require a running server
- Route migration (tasks 5.1–5.2) must not change any DB schema, Prisma queries, or audit-log structure — only the engine call site changes
- `previousSlots` wire type added to `cpSatEngine.ts` in Phase 1 (task 4.3) but serialisation is deferred to Phase 2 (task 7.5) so the type is available for callers without creating a broken intermediate state

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2"] },
    { "id": 10, "tasks": ["8.3"] }
  ]
}
```
