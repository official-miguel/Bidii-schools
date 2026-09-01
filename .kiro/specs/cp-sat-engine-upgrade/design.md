# Design: CP-SAT Engine Upgrade

## Overview

This design covers four incremental phases that transform the existing CP-SAT timetable microservice from a competent baseline into a best-in-class constraint solver. Each phase is independently deployable and backward-compatible with the existing API surface.

The system consists of two tiers:

- **Python solver microservice** (`timetable-solver/solver.py`) — OR-Tools CP-SAT model, exposed as `POST /solve` via FastAPI
- **TypeScript orchestration layer** (`src/lib/timetable/`) — client, controller, and API routes in Next.js

---

## Architecture

### Current Component Map

```
Next.js API Routes
  ├── /api/timetable/v2/versions/[id]/reoptimize  →  generateTimetable() (legacy)
  └── /api/timetable/v2/versions/[id]/batch       →  generateTimetable() (legacy, AUTO_FIX)

regenerationController.ts
  └── generateWithValidation()  →  generateTimetableViaCpSat()  →  POST /solve

cpSatEngine.ts
  └── SolverRequest serialization / SolverResponse deserialization

solver.py (FastAPI)
  └── _solve():
        §1  Template parsing
        §2  Lookups + unavailability map
        §2b valid_double_starts
        §2c-late pooled_pair_keys
        §3  Adaptive daily cap
        §4  Decision variables x[(cid,sid,d_idx,p)]
        §5  ≤ needed per requirement
        §6  No class double-booking
        §7  No teacher double-booking (union-find cluster)
        §8  Teacher daily load cap
        §8b Hard group sync (add_implication)
        §8c Feasibility warnings
        §8d maxConsecutiveLessons
        §8e preventUnintendedDoubles
        §9  Objective (P1–P5)
        §10 Solve
        §11 Extract solution
        §12 Shortfall warnings + stats
```

### Post-Upgrade Component Map

```
Next.js API Routes
  ├── /api/timetable/v2/versions/[id]/reoptimize  →  generateWithValidation() (CP-SAT)
  └── /api/timetable/v2/versions/[id]/batch       →  generateWithValidation() (CP-SAT, AUTO_FIX)

regenerationController.ts  (unchanged interface)

cpSatEngine.ts
  └── CpSatInput adds: lockedSlots[], previousSlots[]
      SolverRequest adds: lockedSlots[], previousSlots[]

solver.py
  └── _solve():
        §1–§4  (unchanged)
        §4b  Hard-fix locked slots  [Phase 1 NEW]
        §5–§9  (unchanged, §9 gets stability term)  [Phase 2: +stability]
        §9b  Greedy warm-start hint  [Phase 2 NEW]
        §10  Two-phase sequential solve  [Phase 3 NEW]
              Tier 1: coverage (P1+P2, 60% of time budget)
              Tier 2: idle minimization (30% of time budget)
        §11–§12  (unchanged, stats extended)

timetable-solver/tests/  [Phase 0 NEW]
  conftest.py
  test_no_double_booking.py
  test_group_sync.py
  test_double_lesson_adjacency.py
  test_consecutive_limits.py
  test_adaptive_cap.py
  test_shortfall_reporting.py
  test_session_preference_guard.py

src/__tests__/timetable/  [Phase 0 NEW]
  cpSatEngine.test.ts
  regenerationController.test.ts
```

---

## Phase 0 — Test Suite

### Python pytest Suite (`timetable-solver/tests/`)

**`conftest.py`** — shared fixtures and factory functions:

```python
import pytest
from solver import SolverRequest, Subject, SchoolClass, Teacher,
                   SubjectRequirement, TeacherAssignment, TeacherUnavailability,
                   TemplateColumn, LinkedClassGroup

def make_template(num_lessons=8, break_after=None):
    """
    Build a minimal TemplateColumn list.
    break_after: insert a BREAK after lesson index break_after (0-based).
    """
    cols = []
    pos = 0
    lesson_idx = 0
    for i in range(num_lessons):
        cols.append(TemplateColumn(
            position=pos, startTime="08:00", endTime="08:45",
            slotType="LESSON", session="MORNING", label=None
        ))
        pos += 1
        lesson_idx += 1
        if break_after is not None and lesson_idx == break_after + 1:
            cols.append(TemplateColumn(
                position=pos, startTime="08:45", endTime="09:00",
                slotType="BREAK", session="MORNING", label=None
            ))
            pos += 1
    return cols


@pytest.fixture
def minimal_school():
    """One class, one teacher, one subject, 5 lessons/week, 5 days."""
    return SolverRequest(
        subjects=[Subject(id="s1", code="MATH", doubleLesson=False)],
        classes=[SchoolClass(id="c1", name="1A")],
        teachers=[Teacher(id="t1", name="Alice")],
        requirements=[SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=5)],
        teacherAssignments=[TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1")],
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
    )
```

**`requirements.txt`** additions:

```
pytest==8.3.5
httpx==0.27.2
```

### TypeScript Jest Tests

**`src/__tests__/timetable/cpSatEngine.test.ts`** — mocks `global.fetch`, tests payload mapping and response mapping for `generateTimetableViaCpSat`.

**`src/__tests__/timetable/regenerationController.test.ts`** — mocks `isSolverHealthy` and `generateTimetableViaCpSat`, tests `generateWithValidation` under healthy/unhealthy/crash scenarios.

---

## Phase 1 — Locked Slots

### Pydantic Models (solver.py)

```python
class LockedSlot(BaseModel):
    classId: str
    subjectId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns
```

Added to `SolverRequest`:

```python
lockedSlots: list[LockedSlot] = Field(default_factory=list)
```

### §4b — Hard-Fix Locked Slots

Inserted after §4 (decision variables) and before §5 (≤ needed):

```python
# §4b. Hard-fix locked slots
# Build a reverse lookup: (cid, sid, dayOfWeek, period_1based) -> variable
# so we don't need to parse variable names.
var_by_slot: dict[tuple[str, str, int, int], cp_model.IntVar] = {
    (cid, sid, days[d_idx], p + 1): v
    for (cid, sid, d_idx, p), v in x.items()
}

for ls in req.lockedSlots:
    v = var_by_slot.get((ls.classId, ls.subjectId, ls.dayOfWeek, ls.period))
    if v is None:
        cls_name = class_by_id.get(ls.classId, SchoolClass(id=ls.classId, name=ls.classId)).name
        sub_code = subject_by_id.get(ls.subjectId, Subject(id=ls.subjectId, code=ls.subjectId)).code
        warnings.append(
            f"Locked slot ignored: no candidate variable for {sub_code}/{cls_name} "
            f"at day={ls.dayOfWeek} period={ls.period} "
            f"(teacher may be unavailable at that slot)."
        )
        continue
    model.add(v == 1)
```

### TypeScript Changes

**`cpSatEngine.ts`** — add to `CpSatInput`:

```typescript
/**
 * Slots that must appear unchanged in the output.
 * The solver hard-fixes these positions before optimising the remainder.
 */
lockedSlots?: Array<{
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  period: number;   // 1-based among LESSON columns
}>;

/**
 * Slots from the previous solve used for stability scoring.
 * The solver rewards keeping these positions, without ever dropping a
 * required lesson to do so.
 */
previousSlots?: Array<{
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  period: number;   // 1-based among LESSON columns
}>;
```

Both default to `[]` in the `SolverRequest` builder.

**`reoptimize/route.ts`** — migrate from `generateTimetable` to `generateWithValidation`:

```typescript
// Remove:
import { generateTimetable } from "@/lib/timetable/deterministicEngine";

// Add:
import { generateWithValidation } from "@/lib/timetable/regenerationController";
import { isSolverHealthy } from "@/lib/timetable/cpSatEngine";
import type { CpSatInput } from "@/lib/timetable/cpSatEngine";

// Build lockedSlots from pinned current slots:
const solverLockedSlots = lockedSlots.map((s) => ({
  classId: s.classId,
  subjectId: s.subjectId,
  dayOfWeek: s.dayOfWeek,
  period: s.period,
}));

// Build CpSatInput and call generateWithValidation() instead of generateTimetable()
const cpSatInput: CpSatInput = {
  subjects: Array.from(subjectMap.values()),
  classes: engineClasses,
  teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
  requirements: engineRequirements,
  teacherAssignments,
  teacherUnavailability: unavailRows,
  sessionPreferences: engineSessionPrefs,
  config: {
    academicYear: timetableConfig.academicYear ?? new Date().getFullYear().toString(),
    term: timetableConfig.term ?? 1,
    operatingDays: timetableConfig.operatingDays,
    maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
    templateColumns,
  },
  lockedSlots: solverLockedSlots,
};

const regen = await generateWithValidation(cpSatInput, validatorInput);
const engineResult = regen.finalResult!;
```

The locked-slot unavailability block (which manually blocked teachers at locked positions) is replaced by passing `lockedSlots` directly. The `lockedCountMap` subtraction from requirements is kept unchanged.

**`batch/route.ts` AUTO_FIX** — same pattern: build `CpSatInput`, call `generateWithValidation`. The `otherSlots` extra unavailability is passed as `teacherUnavailability` on the input.

---

## Phase 2 — Greedy Warm-Start, Determinism, and Stability

### §4 — Variable Reverse Lookup

During §4, alongside building `x`, also build:

```python
# Reverse lookup for warm-start: (cid, sid, d_idx, p) → variable object
# (redundant with x, but avoids name-string parsing in §9b)
var_reverse: dict[tuple[str, str, int, int], cp_model.IntVar] = {}
# Populated inside the existing §4 loop:
#   var_reverse[(cid, sid, d_idx, p)] = v
```

This avoids all variable name string parsing in the warm-start code.

### §9b — Greedy Warm-Start

Inserted after §9 (objective construction) and before §10 (solve):

```python
# §9b. Greedy warm-start heuristic
# Sort requirements by number of candidate slots ascending (scarcest first).
# This mimics a greedy timetabler: hard-to-place subjects get priority.
reqs_sorted_by_scarcity = sorted(
    req_vars.items(), key=lambda kv: len(kv[1])
)
greedy_chosen: dict[tuple[str, str], set[tuple[int, int]]] = {}  # (cid,sid) -> {(d_idx,p)}
class_occupied: set[tuple[str, int, int]] = set()    # (cid, d_idx, p)
teacher_occupied: set[tuple[str, int, int]] = set()  # (tid, d_idx, p)

# Build a reverse map from variable object identity to (cid, sid, d_idx, p)
var_to_key: dict[int, tuple[str, str, int, int]] = {
    id(v): k for k, v in x.items()
}

for (cid, sid), vars_list in reqs_sorted_by_scarcity:
    needed = req_needed.get((cid, sid), 0)
    tid = assignment_map.get((cid, sid))
    chosen: list[tuple[int, int]] = []
    for v in vars_list:
        if len(chosen) >= needed:
            break
        key = var_to_key.get(id(v))
        if key is None:
            continue
        _, _, d_idx, p = key
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        # Check occupancy for class and teacher at (d_idx, p)
        class_clear = (cid, d_idx, p) not in class_occupied
        teacher_clear = tid is None or (tid, d_idx, p) not in teacher_occupied
        if class_clear and teacher_clear:
            chosen.append((d_idx, p))
            class_occupied.add((cid, d_idx, p))
            if tid:
                teacher_occupied.add((tid, d_idx, p))
            if is_double:
                class_occupied.add((cid, d_idx, p + 1))
                if tid:
                    teacher_occupied.add((tid, d_idx, p + 1))
    greedy_chosen[(cid, sid)] = set(chosen)

# Apply hints from greedy assignment
for (cid, sid), vars_list in req_vars.items():
    chosen_slots = greedy_chosen.get((cid, sid), set())
    for v in vars_list:
        key = var_to_key.get(id(v))
        if key is None:
            continue
        _, _, d_idx, p = key
        model.add_hint(v, 1 if (d_idx, p) in chosen_slots else 0)
```

The existing blanket-hint-all-ones is removed.

### §10 — Random Seed

```python
solver.parameters.random_seed = 42
```

### §9 Extension — Stability Objective

Added at the end of §9, after P5:

```python
# Stability (weight 1) — reward keeping previousSlots positions
# Weight 1 is below P5=2 so it never displaces a better-balanced schedule,
# but it breaks ties in favour of the previous solution.
prev_lookup: set[tuple[str, str, int, int]] = {
    (ps.classId, ps.subjectId, ps.dayOfWeek, ps.period)
    for ps in req.previousSlots
}
for (cid, sid, d_idx, p), v in x.items():
    day = days[d_idx]
    if (cid, sid, day, p + 1) in prev_lookup:
        objective_terms.append((v, 1))
```

---

## Phase 3 — Sequential Two-Phase Solve

### Motivation

A single maximisation objective mixes coverage (P1/P2) with quality (P3–P5). The solver can spend most of its budget trading coverage for session preferences. The two-phase approach separates concerns:

- **Tier 1**: Maximise coverage (P1+P2 only) with 60% of the time budget. Lock the achieved coverage as a hard lower bound.
- **Tier 2**: Minimise idle periods (teacher gaps in the day) with 35% of the time budget, subject to the coverage floor.

The remaining 5% is left as safety margin for the solution extraction step.

### Idle Period Model

For each `(teacher, day)` pair with at least one lesson placed, "idle periods" are the interior gaps between the first and last lesson of that day.

```python
# §10a. Build idle period penalty (used in Tier 2 objective)
idle_period_vars: list[cp_model.IntVar] = []

for tid in {assignment_map[k] for k in assignment_map if assignment_map[k]}:
    for d_idx in range(len(days)):
        # All lesson-start variables for this teacher on this day
        t_day_lesson_vars = [
            v for (cid, sid, di, p), v in x.items()
            if di == d_idx and assignment_map.get((cid, sid)) == tid
        ]
        # Deduplicate pooled cluster representatives
        reps = _cluster_representatives(t_day_lesson_vars, pooled_pair_keys)
        if len(reps) < 2:
            continue   # 0 or 1 lesson: no gaps possible
        
        n = num_periods
        # has_lesson[p] = 1 iff teacher has at least one lesson at period p
        has_lesson: list[cp_model.IntVar] = []
        for p in range(n):
            p_vars = [
                v for v in reps
                if var_to_key.get(id(v), (None,) * 4)[3] == p
            ]
            # Also include double-lesson variables that *span* period p
            hl = model.new_bool_var(f"hl_{tid}_{d_idx}_{p}")
            if p_vars:
                model.add_bool_or([*p_vars, hl.negated()])
                for pv in p_vars:
                    model.add_implication(pv, hl)
            else:
                model.add(hl == 0)
            has_lesson.append(hl)
        
        # first_lesson[p] = 1 iff has_lesson[p] == 1 and all has_lesson[0..p-1] == 0
        # last_lesson[p]  = 1 iff has_lesson[p] == 1 and all has_lesson[p+1..n-1] == 0
        # idle[p] = 1 iff NOT has_lesson[p] AND exists q<p: has_lesson[q] AND
        #                                       exists r>p: has_lesson[r]
        # 
        # Equivalent and cheaper: idle[p] = has_lesson_before[p] AND has_lesson_after[p]
        #                                   AND NOT has_lesson[p]
        #
        # has_lesson_before[p] = OR(has_lesson[0..p-1])
        # has_lesson_after[p]  = OR(has_lesson[p+1..n-1])
        
        for p in range(1, n - 1):
            idle = model.new_bool_var(f"idle_{tid}_{d_idx}_{p}")
            # has_before: at least one lesson strictly before p
            has_before = model.new_bool_var(f"hbef_{tid}_{d_idx}_{p}")
            model.add_bool_or([*has_lesson[:p], has_before.negated()])
            for hl in has_lesson[:p]:
                model.add_implication(hl, has_before)
            # has_after: at least one lesson strictly after p
            has_after = model.new_bool_var(f"haft_{tid}_{d_idx}_{p}")
            model.add_bool_or([*has_lesson[p + 1:], has_after.negated()])
            for hl in has_lesson[p + 1:]:
                model.add_implication(hl, has_after)
            # idle = has_before AND has_after AND NOT has_lesson[p]
            model.add_bool_and([has_before, has_after, has_lesson[p].negated()]).only_enforce_if(idle)
            model.add(idle == 0).only_enforce_if(idle.negated())
            # Proper: idle implies has_before, has_after, not has_lesson[p]
            model.add_implication(idle, has_before)
            model.add_implication(idle, has_after)
            model.add_implication(idle, has_lesson[p].negated())
            idle_period_vars.append(idle)
```

### §10 — Sequential Solve

```python
# ── 10. Sequential Two-Phase Solve ──────────────────────────────────────
tier1_budget = req.timeLimitSeconds * 0.60
tier2_budget = req.timeLimitSeconds * 0.35

# ── Tier 1: Maximise coverage (P1 + P2 terms only) ──────────────────────
# Build a coverage-only objective on a *copy* of the model.
# We share all variables and hard constraints; only the objective differs.
tier1_model = model.Clone()   # OR-Tools CpModel.Clone() (available from 9.x)
coverage_vars = []
for (cid, sid), vars_list in req_vars.items():
    needed = req_needed.get((cid, sid), 0)
    if not vars_list or needed == 0:
        continue
    rc_name = f"rc_{cid}_{sid}"
    # Find the existing rc BoolVar by name (it was built in §9)
    # Alternatively, re-build it on the cloned model:
    rc = tier1_model.new_bool_var(rc_name + "_t1")
    tier1_model.add(sum(vars_list) >= needed).only_enforce_if(rc)
    tier1_model.add(sum(vars_list) < needed).only_enforce_if(rc.negated())
    coverage_vars.append((rc, 1_000_000 * needed))

p2_vars = [(v, 200_000 if subject_by_id.get(sid, Subject(id=sid, code=sid)).doubleLesson else 100_000)
           for (cid, sid, d_idx, p), v in x.items()]
tier1_model.maximize(sum(w * v for v, w in coverage_vars + p2_vars))

tier1_solver = cp_model.CpSolver()
tier1_solver.parameters.max_time_in_seconds = tier1_budget
tier1_solver.parameters.random_seed = 42
tier1_solver.parameters.num_workers = max(1, os.cpu_count() or 1)
tier1_solver.parameters.log_search_progress = False

tier1_status = tier1_solver.solve(tier1_model)
tier1_feasible = tier1_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

# Count achieved coverage (physical slots scheduled in Tier 1)
achieved_physical = 0
if tier1_feasible:
    for (cid, sid, d_idx, p), v in x.items():
        if tier1_solver.value(v) == 1:
            subject = subject_by_id.get(sid)
            achieved_physical += 2 if (subject.doubleLesson if subject else False) else 1
    # Warm-start Tier 2 from Tier 1's solution
    for v in x.values():
        model.add_hint(v, tier1_solver.value(v))

# ── Lock coverage floor ──────────────────────────────────────────────────
# Compute actual placed count from Tier 1 values; use as a hard lower bound
# in the full model so Tier 2 cannot sacrifice coverage for quality.
if tier1_feasible and achieved_physical > 0:
    all_x_vars = list(x.values())
    placed_count_var = sum(all_x_vars)  # linear expression
    model.add(placed_count_var >= achieved_physical)

# ── Tier 2: Minimise idle periods (keeping the full objective for tie-breaking) ─
# Replace the maximise objective with minimise idle periods.
# The original P3–P5 soft terms are dropped; coverage floor is now a hard constraint.
if idle_period_vars:
    model.minimize(sum(idle_period_vars))
else:
    # No teachers with ≥2 lessons/day — nothing to minimize; keep coverage objective.
    pass

tier2_solver = cp_model.CpSolver()
tier2_solver.parameters.max_time_in_seconds = tier2_budget
tier2_solver.parameters.random_seed = 42
tier2_solver.parameters.num_workers = max(1, os.cpu_count() or 1)
tier2_solver.parameters.log_search_progress = False

status_code = tier2_solver.solve(model)
solver = tier2_solver   # use for value extraction in §11

status_name = tier2_solver.status_name(status_code)
log.info(
    "Tier 1 (coverage): %s  (wall=%.2fs)   Tier 2 (idle-min): %s  (wall=%.2fs)",
    tier1_solver.status_name(tier1_status), tier1_solver.wall_time,
    status_name, tier2_solver.wall_time,
)
feasible = status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE)
# Fall back to Tier 1 solution if Tier 2 found nothing
if not feasible and tier1_feasible:
    solver = tier1_solver
    feasible = True
    model_for_extraction = tier1_model
```

### Stats Extensions

All new keys are always present in the response with a `0.0` fallback:

| Key | Description |
|---|---|
| `tier1WallTime` | Tier 1 solver wall time in seconds |
| `tier2WallTime` | Tier 2 solver wall time in seconds |
| `idlePeriodsMinimised` | Number of idle teacher-day periods in the final schedule |
| `warmStartHints` | Number of variables that received a greedy hint |
| `lockedSlotsApplied` | Number of locked slots hard-fixed |
| `previousSlotsRetained` | Number of previous slot positions preserved in output |

---

## Data Models

### Updated `SolverRequest` (solver.py)

```python
class LockedSlot(BaseModel):
    classId: str
    subjectId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns

class PreviousSlot(BaseModel):
    classId: str
    subjectId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns

class SolverRequest(BaseModel):
    # ... existing fields ...
    lockedSlots: list[LockedSlot] = Field(default_factory=list)
    previousSlots: list[PreviousSlot] = Field(default_factory=list)
```

### Updated `CpSatInput` (cpSatEngine.ts)

```typescript
export type LockedSlotPin = {
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  period: number;
};

export type CpSatInput = {
  // ... existing fields ...
  lockedSlots?: LockedSlotPin[];
  previousSlots?: LockedSlotPin[];
};
```

---

## Error Handling

### solver.py

| Scenario | Behaviour |
|---|---|
| `lockedSlots` references a slot with no candidate variable (teacher unavailable) | Append a warning, skip the lock, do not crash |
| Tier 1 finds no solution within budget | Tier 2 proceeds without coverage floor; Tier 1 wall time reported |
| Tier 2 finds no improvement | Fall back to Tier 1 solution; `tier2WallTime` recorded |
| `idle_period_vars` is empty (0 or 1 lesson per teacher/day) | Skip idle objective; Tier 2 becomes a no-op |
| Greedy warm-start leaves a requirement without any hint (no feasible greedy slot) | All-zero hint for that requirement; solver explores freely |

### cpSatEngine.ts

| Scenario | Behaviour |
|---|---|
| `lockedSlots` / `previousSlots` omitted | Defaults to `[]` in `SolverRequest` |
| Solver returns slots but some locked slots are missing | Warning included in `raw.warnings`; result still returned as success |

### Route handlers

| Scenario | Behaviour |
|---|---|
| `isSolverHealthy()` returns false | `generateWithValidation` returns `aborted: true`; route returns 503 with reason |
| Solver returns partial timetable | Route saves partial result; shortfall warnings passed through to client |

---

## Interface Contracts

### `POST /solve` request additions

```json
{
  "lockedSlots": [
    { "classId": "c1", "subjectId": "s1", "dayOfWeek": 1, "period": 3 }
  ],
  "previousSlots": [
    { "classId": "c1", "subjectId": "s1", "dayOfWeek": 1, "period": 3 }
  ]
}
```

### `POST /solve` stats additions

```json
{
  "stats": {
    "totalLessonsScheduled": 120,
    "totalLessonsRequired": 120,
    "completionRate": 100.0,
    "wallTime": 12.4,
    "tier1WallTime": 7.2,
    "tier2WallTime": 4.1,
    "branches": 18320,
    "conflicts": 412,
    "objectiveValue": 0,
    "idlePeriodsMinimised": 3,
    "warmStartHints": 84,
    "lockedSlotsApplied": 5,
    "previousSlotsRetained": 61
  }
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: No Teacher Double-Booking

*For any* valid school configuration (any number of classes, teachers, requirements, operating days, and template), the CP-SAT solver SHALL never place two slots with the same `teacherId` at the same `(dayOfWeek, period)` in its output, except when those slots belong to a co-scheduled LinkedClassGroup for the same subject.

**Validates: Requirements 1.2**

---

### Property 2: No Class Double-Booking

*For any* valid school configuration, the CP-SAT solver SHALL never place two slots with the same `classId` at the same `(dayOfWeek, period)` in its output.

**Validates: Requirements 1.2**

---

### Property 3: Linked-Class-Group Synchronisation

*For any* LinkedClassGroup containing classes C₁ and C₂ and subject S, if the solver places a slot for C₁ with subject S at `(day, period)`, it SHALL also place a slot for C₂ with subject S at the same `(day, period)`, and vice versa.

**Validates: Requirements 1.3**

---

### Property 4: Double-Lesson Adjacency

*For any* solved timetable containing a double-lesson subject, every placed double-lesson variable at lesson-period index `p` SHALL occupy template column positions `pos[p]` and `pos[p+1]` where `pos[p+1] == pos[p] + 1` (i.e., no non-LESSON column sits between them in the full template).

**Validates: Requirements 1.4**

---

### Property 5: Consecutive Lesson Limit

*For any* solved timetable with `maxConsecutiveLessons = N`, no class SHALL have more than `N` consecutively occupied physical periods on any single day. Furthermore, when `preventUnintendedDoubles = true`, no single-lesson subject SHALL occupy two consecutive periods for the same class on the same day.

**Validates: Requirements 1.5**

---

### Property 6: Session Preference Never Drops a Lesson

*For any* school where a teacher's availability leaves zero slots in the preferred session for a subject, the solver SHALL still schedule all required lessons for that subject (placing them in the available non-preferred session rather than leaving them unscheduled).

**Validates: Requirements 1.8**

---

### Property 7: Locked Slot Preservation

*For any* `LockedSlot` entry in the request that corresponds to a valid candidate variable, the solver output SHALL contain a slot for that exact `(classId, subjectId, dayOfWeek, period)` tuple.

**Validates: Requirements 2.1**

---

### Property 8: Shortfall Warning Arithmetic

*For any* partially-scheduled `(classId, subjectId)` pair, the shortfall warning message SHALL report a placed count `X` that equals the number of slots with that `(classId, subjectId)` pair in the `slots` array (counting double-lesson physical slots as 2), and a required count `Y` equal to `lessonsPerWeek * (2 if doubleLesson else 1)`.

**Validates: Requirements 1.7**

---

### Property 9: Stability Objective Does Not Reduce Coverage

*For any* school configuration, adding `previousSlots` to the request SHALL produce a `completionRate` that is greater than or equal to the `completionRate` produced by the same request without `previousSlots`.

**Validates: Requirements 3.3**

---

### Property 10: Determinism Under Fixed Seed

*For any* fixed solver request, two successive calls to `POST /solve` with `random_seed = 42` SHALL return identical `slots` arrays (same set of `(classId, subjectId, dayOfWeek, period)` tuples, regardless of wall-clock time variation).

**Validates: Requirements 3.2**

---

### Property 11: Two-Phase Coverage Monotonicity

*For any* school configuration, the number of physical lesson slots placed in the Tier 2 (idle-minimisation) output SHALL be greater than or equal to the number placed by Tier 1 alone (`achieved_physical` lower bound).

**Validates: Requirements 4.1**

---

### Property 12: Payload Field Mapping Round-Trip

*For any* `CpSatInput`, the serialised `SolverRequest` payload sent by `generateTimetableViaCpSat` SHALL contain all fields from the input mapped to their correct wire types, with `lockedSlots` and `previousSlots` defaulting to `[]` when omitted from the input.

**Validates: Requirements 5.1, 6.1**

---

### Property 13: Stats Keys Always Present

*For any* `SolverResponse` returned by `POST /solve`, the `stats` object SHALL contain all documented keys (`totalLessonsScheduled`, `totalLessonsRequired`, `completionRate`, `wallTime`, `branches`, `conflicts`, `tier1WallTime`, `tier2WallTime`, `idlePeriodsMinimised`, `warmStartHints`, `lockedSlotsApplied`, `previousSlotsRetained`) with numeric values (defaulting to `0.0` when not applicable).

**Validates: Requirements 5.2**

---

## Testing Strategy

### Dual Approach

Both the Python pytest suite and the TypeScript Jest suite follow a dual testing strategy:

- **Property tests** (pytest with Hypothesis / Jest with fast-check): validate universal invariants across random inputs
- **Example tests** (pytest parametrize / Jest describe): validate specific scenarios, edge cases, and integration points

### Python (pytest + Hypothesis)

```python
# Property test example:
from hypothesis import given, settings
from hypothesis import strategies as st

@given(
    num_classes=st.integers(min_value=1, max_value=5),
    num_subjects=st.integers(min_value=1, max_value=4),
    lessons_per_week=st.integers(min_value=1, max_value=5),
)
@settings(max_examples=100)
def test_no_teacher_double_booking(num_classes, num_subjects, lessons_per_week):
    req = build_random_school(num_classes, num_subjects, lessons_per_week)
    resp = client.post("/solve", json=req.model_dump())
    slots = resp.json()["slots"]
    teacher_slots = [(s["teacherId"], s["dayOfWeek"], s["period"]) for s in slots]
    assert len(teacher_slots) == len(set(teacher_slots)), "Teacher double-booking detected"
```

Each property test runs a minimum of 100 iterations and is tagged:

```python
# Feature: cp-sat-engine-upgrade, Property 1: No Teacher Double-Booking
```

### TypeScript (Jest + fast-check)

```typescript
// Property test example:
import * as fc from "fast-check";

it("maps all CpSatInput fields to SolverRequest correctly", () => {
  fc.assert(
    fc.property(arbitraryCpSatInput(), (input) => {
      const payload = capturedPayload(input);
      expect(payload.lockedSlots).toEqual(input.lockedSlots ?? []);
      expect(payload.previousSlots).toEqual(input.previousSlots ?? []);
      expect(payload.subjects).toHaveLength(input.subjects.length);
    }),
    { numRuns: 100 }
  );
});
```

### Test File Summary

| File | Type | Properties Covered |
|---|---|---|
| `tests/test_no_double_booking.py` | Property | P1, P2 |
| `tests/test_group_sync.py` | Property | P3 |
| `tests/test_double_lesson_adjacency.py` | Property | P4 |
| `tests/test_consecutive_limits.py` | Property | P5 |
| `tests/test_session_preference_guard.py` | Property | P6 |
| `tests/test_shortfall_reporting.py` | Property | P8 |
| `tests/test_adaptive_cap.py` | Property | P6 (via coverage) |
| `src/__tests__/timetable/cpSatEngine.test.ts` | Property + Example | P7, P12, P13 |
| `src/__tests__/timetable/regenerationController.test.ts` | Example | Integration (2.2, 2.3, 6.2) |
