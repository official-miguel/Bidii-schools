"""
Timetable CP-SAT Solver Microservice
=====================================
POST /solve  → always returns a timetable. If perfect coverage is impossible
               (overloaded teacher, tight unavailability), the solver maximises
               the number of lessons placed and reports shortfalls as warnings.
               It never returns INFEASIBLE — the admin fixes data problems after
               seeing what couldn't be placed.

Model design
------------
The core insight is that we use TWO layers of variables:

  x[cid, sid, d_idx, p]   — BoolVar: "lesson placed here"
  placed[cid, sid]         — IntVar : count of lessons actually placed (0…needed)

Hard constraints (never violated)
  1. No teacher double-booking    — teacher × day × period ≤ 1, EXCEPT for
                                    pooled group sessions where the same teacher
                                    co-teaches all classes simultaneously
  2. No class double-booking      — class  × day × period ≤ 1
  3. Teacher unavailability       — blocked slots have no variables
  4. Teacher daily load cap       — adaptive: raised when total load exceeds
                                    configured cap × num_days; pooled sessions
                                    count as ONE lesson toward the cap
  5. Double lessons consecutive   — only placed at lesson-period pairs that are
                                    truly adjacent in the template (no BREAK/LUNCH
                                    column between them)
  6. Linked-class-group sync      — all classes in an elective group must have
                                    every group subject at the SAME (day, period)

Objective (maximised, priority order via weights)
  P1 (weight 1 000 000 × needed) — complete a requirement fully (all lessons placed)
  P2 (weight 100 000 / 200 000) — place each individual lesson (single / double)
  P3 (weight 500/100) — session preferences, reward only — no wrong-session penalty
  P4 (weight 10)     — subject spread across days
  P5 (weight 2)      — teacher load balance
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("solver")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Subject(BaseModel):
    id: str
    code: str
    internalCode: int = 0
    doubleLesson: bool = False
    requiresSpecialRoom: Optional[str] = None


class SchoolClass(BaseModel):
    id: str
    name: str
    form: int = 1
    streamIndex: int = 0


class Teacher(BaseModel):
    id: str
    name: str


class SubjectRequirement(BaseModel):
    classId: str
    subjectId: str
    lessonsPerWeek: int


class TeacherAssignment(BaseModel):
    classId: str
    subjectId: str
    teacherId: str


class TeacherUnavailability(BaseModel):
    teacherId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns


class SessionPreference(BaseModel):
    subjectCode: str
    preferredSession: str   # "MORNING" | "AFTERNOON" | "EVENING"
    isHard: bool = False


class TemplateColumn(BaseModel):
    position: int
    startTime: str
    endTime: str
    slotType: str   # "LESSON" | "BREAK" | "LUNCH" | "GAMES" | "ASSEMBLY"
    session: str    # "MORNING" | "AFTERNOON" | "EVENING"
    label: Optional[str] = None


class LinkedClassGroup(BaseModel):
    """
    Hard co-scheduling constraint.

    Every class in ``classIds`` must have every subject in ``subjectIds``
    scheduled at the **same** (dayOfWeek, period).  This is used for elective
    / group subjects where students move between streams and therefore all
    streams must run the lesson simultaneously.

    The constraint is implemented as a pair-wise equality:
        x[c1, sid, d, p] == x[c2, sid, d, p]   for all c1≠c2, d, p
    which means the solver is forced to choose the same slot for every class.
    """
    subjectIds: list[str]
    classIds: list[str]


class LockedSlot(BaseModel):
    """
    A slot that must appear unchanged in the solver output.
    The solver adds model.add(x[(classId, subjectId, d_idx, period-1)] == 1)
    for each locked slot after the decision variables are built in §4.
    """
    classId: str
    subjectId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns


class PreviousSlot(BaseModel):
    """
    A slot from a previous timetable version used as a soft stability bias.
    The solver adds a stability objective term (+1) to prefer placing lessons
    at the same positions as in the previous version.
    """
    classId: str
    subjectId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns


class SolverRequest(BaseModel):
    subjects: list[Subject]
    classes: list[SchoolClass]
    teachers: list[Teacher]
    requirements: list[SubjectRequirement]
    teacherAssignments: list[TeacherAssignment]
    teacherUnavailability: list[TeacherUnavailability] = Field(default_factory=list)
    sessionPreferences: list[SessionPreference] = Field(default_factory=list)
    templateColumns: list[TemplateColumn]
    operatingDays: list[int]
    maxLessonsPerTeacherPerDay: int = 6
    timeLimitSeconds: float = 60.0
    linkedClassGroups: list[LinkedClassGroup] = Field(default_factory=list)
    lockedSlots: list[LockedSlot] = Field(default_factory=list)
    previousSlots: list[PreviousSlot] = Field(default_factory=list)
    # Hard constraint: maximum consecutive lessons a class may have in a row
    # on the same day (default 2 = one double-block max).
    maxConsecutiveLessons: int = 2
    # Hard constraint: a non-double subject must never occupy two consecutive
    # periods for the same class on the same day (no accidental doubles).
    preventUnintendedDoubles: bool = True


class GeneratedSlot(BaseModel):
    classId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns
    subjectId: str
    teacherId: str
    room: Optional[str] = None


class SolverResponse(BaseModel):
    status: str
    slots: list[GeneratedSlot] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="Timetable CP-SAT Solver", version="2.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "solver": "cp-sat"}


@app.post("/solve", response_model=SolverResponse)
def solve(req: SolverRequest) -> SolverResponse:
    try:
        return _solve(req)
    except Exception as exc:
        log.exception("Unexpected solver error")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Core solver — always produces a result
# ---------------------------------------------------------------------------

def _solve(req: SolverRequest) -> SolverResponse:
    warnings: list[str] = []

    # ── 1. Template ──────────────────────────────────────────────────────
    lesson_cols = sorted(
        [c for c in req.templateColumns if c.slotType == "LESSON"],
        key=lambda c: c.position,
    )
    num_periods = len(lesson_cols)

    if num_periods == 0:
        return SolverResponse(
            status="FEASIBLE",
            warnings=["Template has no LESSON columns — nothing to schedule"],
        )

    period_session: list[str] = [c.session for c in lesson_cols]
    days = req.operatingDays

    if not days:
        return SolverResponse(
            status="FEASIBLE",
            warnings=["No operating days configured — nothing to schedule"],
        )

    # ── 2. Lookups ───────────────────────────────────────────────────────
    subject_by_id = {s.id: s for s in req.subjects}
    class_by_id   = {c.id: c for c in req.classes}
    teacher_by_id = {t.id: t for t in req.teachers}

    assignment_map: dict[tuple[str, str], str] = {
        (a.classId, a.subjectId): a.teacherId
        for a in req.teacherAssignments
    }

    # teacherId → set of (dayOfWeek, period-0-based)
    unavail: dict[str, set[tuple[int, int]]] = {}
    for u in req.teacherUnavailability:
        unavail.setdefault(u.teacherId, set()).add((u.dayOfWeek, u.period - 1))

    session_pref_map: dict[str, SessionPreference] = {
        p.subjectCode.upper(): p for p in req.sessionPreferences
    }

    # ── 2b. Consecutive lesson-period pairs ──────────────────────────────
    # Two lesson-period indices p and p+1 (0-based) are "truly consecutive"
    # only when there is no non-LESSON column between them in the full
    # template.  Example template: [L1, L2, BREAK, L3, L4] — lesson indices
    # 0 and 1 are consecutive (template positions 0,1 are adjacent), but
    # lesson indices 1 and 2 are NOT (template position 2 is a BREAK).
    #
    # We build a set of valid 0-based starting lesson-indices for double
    # lessons.  A double lesson starting at lesson-index p occupies p and
    # p+1, which is only valid when the template positions of those two
    # lesson columns are adjacent (differ by 1).
    _all_cols_sorted = sorted(req.templateColumns, key=lambda c: c.position)
    _lesson_positions: list[int] = [
        c.position for c in _all_cols_sorted if c.slotType == "LESSON"
    ]
    # valid_double_starts[p] = True  iff lesson p and lesson p+1 are adjacent
    # in the full template (no non-lesson column between them).
    valid_double_starts: set[int] = set()
    for i in range(len(_lesson_positions) - 1):
        if _lesson_positions[i + 1] == _lesson_positions[i] + 1:
            valid_double_starts.add(i)  # 0-based lesson index

    # ── 2c. Pooled-session lookup (built from linkedClassGroups) ─────────
    #
    # A "pooled session" is a (teacher, subject, d_idx, p) slot where the
    # same teacher simultaneously teaches the same subject to MORE THAN ONE
    # class because all those classes are co-scheduled via a LinkedClassGroup.
    # The teacher physically delivers ONE lesson; the CP-SAT variables for
    # every class in the group at that (d_idx, p) must all be 1 together
    # (enforced by the add_implication pairs in section 8b).
    #
    # This lookup is used in sections 3, 7, and 8 to avoid counting those
    # shared variables multiple times against the teacher.
    #
    # pooled_var_pairs: set of frozenset({var_id_a, var_id_b}) pairs that are
    # in the same group for the same subject.  Built lazily after x is populated
    # (see "── 2c-late" marker just before section 7).
    #
    # group_class_pairs: set of (cid1, cid2, sid) triples where cid1 and cid2
    # are in the same LinkedClassGroup for subject sid.  Used in sections 3 & 8
    # before x is built.
    group_class_pairs: set[tuple[str, str, str]] = set()
    for grp in req.linkedClassGroups:
        for sid in grp.subjectIds:
            for i, c1 in enumerate(grp.classIds):
                for c2 in grp.classIds[i + 1:]:
                    group_class_pairs.add((c1, c2, sid))
                    group_class_pairs.add((c2, c1, sid))

    # ── 3. Adaptive daily cap per teacher ────────────────────────────────
    # A teacher with N total lessons/week needs at least ceil(N / num_days)
    # per day.  For double-lesson subjects each lessonsPerWeek unit occupies
    # 2 physical periods, so we convert to physical period count first.
    #
    # For linked-class-group subjects the same teacher covers N classes at
    # the SAME slot — it is ONE physical lesson, not N.  We therefore only
    # count the requirement ONCE per (teacher, subject) pair instead of once
    # per (teacher, subject, class).
    teacher_total: dict[str, int] = {}
    # Track which (teacher, subject) pairs have already been counted so that
    # group subjects are counted exactly once.
    teacher_subject_counted: set[tuple[str, str]] = set()
    for r in req.requirements:
        tid = assignment_map.get((r.classId, r.subjectId))
        if not tid:
            continue
        subject = subject_by_id.get(r.subjectId)
        is_double = subject.doubleLesson if subject else False
        physical = r.lessonsPerWeek * (2 if is_double else 1)
        # Is this (teacher, subject) a pooled group subject?
        # It is pooled if ANY other class in the requirements has the same
        # teacher for the same subject AND they share a group.
        is_pooled = any(
            assignment_map.get((r2.classId, r2.subjectId)) == tid
            and r2.subjectId == r.subjectId
            and r2.classId != r.classId
            and (r.classId, r2.classId, r.subjectId) in group_class_pairs
            for r2 in req.requirements
        )
        if is_pooled:
            ts_key = (tid, r.subjectId)
            if ts_key in teacher_subject_counted:
                continue  # already counted this pooled lesson once
            teacher_subject_counted.add(ts_key)
        teacher_total[tid] = teacher_total.get(tid, 0) + physical

    effective_cap_for: dict[str, int] = {}
    for tid, total in teacher_total.items():
        min_feasible = -(-total // len(days))   # ceil(total / days)
        effective = max(req.maxLessonsPerTeacherPerDay, min_feasible)
        effective_cap_for[tid] = effective
        if effective > req.maxLessonsPerTeacherPerDay:
            tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
            warnings.append(
                f"Teacher {tname!r} needs {total} lessons/week across {len(days)} days "
                f"(≥{min_feasible}/day) but the daily cap is "
                f"{req.maxLessonsPerTeacherPerDay} — cap raised to {effective} for this teacher."
            )

    # ── 4. Build decision variables ──────────────────────────────────────
    model = cp_model.CpModel()

    # x[(cid, sid, d_idx, p)] = 1 iff lesson placed at (class, subject, day, period)
    x: dict[tuple[str, str, int, int], cp_model.IntVar] = {}
    # (cid, sid) → list of x-variables for that requirement
    req_vars: dict[tuple[str, str], list[cp_model.IntVar]] = {}
    # (cid, sid) → how many lessons are needed (single or double-blocks)
    req_needed: dict[tuple[str, str], int] = {}
    # Reverse lookup for warm-start and locked-slot pinning:
    # id(variable) → (cid, sid, d_idx, p) so we don't need name-string parsing.
    var_to_key: dict[int, tuple[str, str, int, int]] = {}

    for r in req.requirements:
        cid, sid = r.classId, r.subjectId
        tid = assignment_map.get((cid, sid))
        cls_name = class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
        sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code

        if tid is None:
            # No teacher assigned — warn, skip, placed count = 0
            warnings.append(
                f"No teacher assigned to {sub_code} for {cls_name} "
                f"({r.lessonsPerWeek} lessons/week will be unscheduled)."
            )
            req_vars[(cid, sid)] = []
            req_needed[(cid, sid)] = r.lessonsPerWeek
            continue

        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        teacher_unavail = unavail.get(tid, set())
        vars_for_req: list[cp_model.IntVar] = []

        for d_idx, day in enumerate(days):
            p = 0
            while p < num_periods:
                if is_double:
                    if p + 1 >= num_periods:
                        p += 1
                        continue
                    # Skip if these two lesson-period indices are not truly
                    # adjacent in the template (a break/lunch sits between them)
                    if p not in valid_double_starts:
                        p += 1
                        continue
                    if (day, p) in teacher_unavail or (day, p + 1) in teacher_unavail:
                        p += 1
                        continue
                    v = model.new_bool_var(f"x_{cid}_{sid}_{d_idx}_{p}_D")
                    x[(cid, sid, d_idx, p)] = v
                    var_to_key[id(v)] = (cid, sid, d_idx, p)
                    vars_for_req.append(v)
                    p += 2
                else:
                    if (day, p) in teacher_unavail:
                        p += 1
                        continue
                    v = model.new_bool_var(f"x_{cid}_{sid}_{d_idx}_{p}")
                    x[(cid, sid, d_idx, p)] = v
                    var_to_key[id(v)] = (cid, sid, d_idx, p)
                    vars_for_req.append(v)
                    p += 1

        req_vars[(cid, sid)] = vars_for_req
        # lessonsPerWeek is the number of occurrences to schedule:
        #   doubleLesson=True  → each occurrence is a consecutive pair (2 physical slots)
        #   doubleLesson=False → each occurrence is a single period
        # The solver variable x[(cid,sid,d,p)] already represents one full
        # occurrence (pair or single), so needed == lessonsPerWeek directly.
        needed = r.lessonsPerWeek
        req_needed[(cid, sid)] = needed

        available = len(vars_for_req)
        if available < needed:
            tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
            warnings.append(
                f"{sub_code} for {cls_name}: need {needed} "
                f"{'double-blocks' if is_double else 'lessons'} "
                f"but only {available} candidate slots exist for teacher {tname!r} "
                f"(teacher unavailability may be too restrictive). "
                f"Will place {available} instead."
            )

    # ── 4b. Hard-fix locked slots ────────────────────────────────────────
    #
    # Build a reverse lookup: (classId, subjectId, dayOfWeek_actual, period_1based) → variable
    # so we can look up exactly which variable to pin without parsing names.
    var_by_slot: dict[tuple[str, str, int, int], cp_model.IntVar] = {
        (cid, sid, days[d_idx], p + 1): v
        for (cid, sid, d_idx, p), v in x.items()
    }

    locked_slots_applied = 0
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
        locked_slots_applied += 1

    # ── 5. Constraint: ≤ needed per requirement ──────────────────────────
    # We allow up to `needed` lessons placed, not exactly `needed`.
    # The objective maximises placement so the solver fills as many as possible.
    for (cid, sid), vars_list in req_vars.items():
        needed = req_needed.get((cid, sid), 0)
        if not vars_list:
            continue
        # Upper bound: don't overschedule
        model.add(sum(vars_list) <= needed)

    # ── 6. No class double-booking ───────────────────────────────────────
    class_slot_vars: dict[tuple[str, int, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        class_slot_vars.setdefault((cid, d_idx, p), []).append(v)
        if is_double:
            class_slot_vars.setdefault((cid, d_idx, p + 1), []).append(v)

    for slot_vars in class_slot_vars.values():
        if len(slot_vars) > 1:
            model.add_at_most_one(slot_vars)

    # ── 2c-late. Build pooled-variable pairs from linkedClassGroups ───────
    #
    # Now that x is fully populated we can identify which variable pairs
    # represent the same teacher teaching the same subject to two co-scheduled
    # classes (a pooled session).  These pairs must be EXEMPTED from the
    # add_at_most_one teacher double-booking constraint below — they are
    # intentionally both 1 at the same (d_idx, p) because section 8b forces
    # them equal via add_implication.
    #
    # pooled_pair_key: frozenset of the two cp_model variable names that are
    # in the same group for the same subject at the same slot.  Using the
    # variable's .name attribute gives a stable, hashable identity.
    pooled_pair_keys: set[frozenset] = set()
    for grp in req.linkedClassGroups:
        for sid in grp.subjectIds:
            for d_idx in range(len(days)):
                for p in range(num_periods):
                    # Collect all variables in this group for this (sid, d_idx, p)
                    grp_vars_at_slot = [
                        x[(cid, sid, d_idx, p)]
                        for cid in grp.classIds
                        if (cid, sid, d_idx, p) in x
                    ]
                    if len(grp_vars_at_slot) < 2:
                        continue
                    # Every pair within this group at this slot is pooled
                    for i, va in enumerate(grp_vars_at_slot):
                        for vb in grp_vars_at_slot[i + 1:]:
                            pooled_pair_keys.add(frozenset({va.name, vb.name}))
                    # Double-lesson: these vars also occupy p+1 — exempt those too
                    subject = subject_by_id.get(sid)
                    if subject and subject.doubleLesson:
                        # The variable is stored at p (the start), but it
                        # also occupies p+1.  teacher_slot_vars[tid, d_idx, p+1]
                        # will contain the same variable objects, so the same
                        # pooled_pair_keys already cover the p+1 slot.
                        pass  # covered by the loop below via variable identity

    # ── 7. No teacher double-booking ─────────────────────────────────────
    #
    # A teacher can only be in one place at a time — UNLESS the conflicting
    # variables belong to the same LinkedClassGroup for the same subject at
    # the same slot (a "pooled session").  In that case the teacher is teaching
    # all those classes simultaneously in one room; section 8b forces all
    # those variables to the same value, so having more than one = 1 is both
    # valid and required.
    #
    # Strategy: for each (teacher, d_idx, p) bucket with >1 variable, split
    # the variables into "pooled clusters" (variables that are pairwise pooled
    # with every other member) and "independent" ones.  Apply add_at_most_one
    # only to variables from DIFFERENT clusters — i.e. a teacher cannot teach
    # two independent lessons AND a pooled cluster lesson at the same slot, but
    # can have multiple variables firing within a single pooled cluster.
    #
    # Implementation: partition the variable list using a union-find on
    # pooled_pair_keys, then take one representative per component.  The
    # add_at_most_one fires on those representatives — at most one *cluster*
    # can be active at any slot, which is correct.
    teacher_slot_vars: dict[tuple[str, int, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        tid = assignment_map.get((cid, sid))
        if tid is None:
            continue
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        teacher_slot_vars.setdefault((tid, d_idx, p), []).append(v)
        if is_double:
            teacher_slot_vars.setdefault((tid, d_idx, p + 1), []).append(v)

    def _cluster_representatives(
        slot_vars: list[cp_model.IntVar],
        pooled_keys: set[frozenset],
    ) -> list[cp_model.IntVar]:
        """
        Partition slot_vars into pooled clusters via union-find.
        Return one representative variable per cluster.
        Two variables are in the same cluster when their (name, name) pair
        is in pooled_keys — meaning they are co-scheduled group variables.
        """
        n = len(slot_vars)
        parent = list(range(n))

        def find(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(i: int, j: int) -> None:
            parent[find(i)] = find(j)

        for i in range(n):
            for j in range(i + 1, n):
                if frozenset({slot_vars[i].name, slot_vars[j].name}) in pooled_keys:
                    union(i, j)

        # Pick the lowest-index member of each component as the representative
        seen_roots: set[int] = set()
        reps: list[cp_model.IntVar] = []
        for i in range(n):
            root = find(i)
            if root not in seen_roots:
                seen_roots.add(root)
                reps.append(slot_vars[i])
        return reps

    for slot_vars in teacher_slot_vars.values():
        if len(slot_vars) <= 1:
            continue
        # Reduce to one representative per pooled cluster, then constrain
        reps = _cluster_representatives(slot_vars, pooled_pair_keys)
        if len(reps) > 1:
            model.add_at_most_one(reps)

    # ── 8. Teacher daily load cap (adaptive) ─────────────────────────────
    #
    # Each variable contributes its physical weight (1 for single, 2 for
    # double) toward the teacher's daily lesson count.  For pooled-session
    # variables (same teacher, same subject, same slot, co-scheduled classes)
    # only ONE variable per pooled cluster should contribute — the teacher is
    # physically present once.
    #
    # We reuse _cluster_representatives to pick one variable per cluster per
    # (teacher, day) bucket.
    teacher_day_vars: dict[tuple[str, int], list[tuple[cp_model.IntVar, int]]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        tid = assignment_map.get((cid, sid))
        if tid is None:
            continue
        subject = subject_by_id.get(sid)
        weight = 2 if (subject.doubleLesson if subject else False) else 1
        teacher_day_vars.setdefault((tid, d_idx), []).append((v, weight))

    for (tid, d_idx), wvars in teacher_day_vars.items():
        cap = effective_cap_for.get(tid, req.maxLessonsPerTeacherPerDay)
        # Deduplicate pooled clusters: keep one (var, weight) per cluster
        vars_only = [v for v, _ in wvars]
        reps_set = set(r.name for r in _cluster_representatives(vars_only, pooled_pair_keys))
        deduped_wvars = [(v, w) for v, w in wvars if v.name in reps_set]
        model.add(sum(v * w for v, w in deduped_wvars) <= cap)

    # ── 8b. Hard group synchronisation ───────────────────────────────────
    #
    # For every LinkedClassGroup, every subject in the group must land on
    # the SAME (day_index, period) for ALL classes in the group.
    #
    # Implementation strategy (pairwise equality):
    #   Pick the first class in the group as the "anchor".  For every other
    #   class c2 and every (d_idx, p), enforce:
    #       x[anchor, sid, d_idx, p] == x[c2, sid, d_idx, p]
    #
    #   CP-SAT does not have a direct == constraint between two BoolVars, but
    #   it does support:
    #       a.implies(b)  AND  b.implies(a)
    #   which is logically equivalent to a == b for BoolVars.
    #
    #   If a variable does not exist for a particular (class, subject, d, p)
    #   slot — because the teacher is unavailable or the subject is not
    #   required for that class — we treat its value as 0 (False).  In that
    #   case we add:
    #       anchor_var == 0  (i.e. the anchor must also be 0 there)
    #   to keep both sides equal.  This can make a group infeasible if one
    #   class has no viable slots and another does; we detect and warn rather
    #   than crashing.

    for grp in req.linkedClassGroups:
        if len(grp.classIds) < 2:
            continue  # nothing to synchronise

        for sid in grp.subjectIds:
            # Check that every class in the group actually has a requirement
            # for this subject; skip silently for classes that don't (the
            # subject may only apply to a subset).
            involved_classes = [
                cid for cid in grp.classIds
                if any(
                    r.classId == cid and r.subjectId == sid
                    for r in req.requirements
                )
            ]
            if len(involved_classes) < 2:
                continue

            anchor = involved_classes[0]
            others = involved_classes[1:]

            for d_idx in range(len(days)):
                for p in range(num_periods):
                    v_anchor = x.get((anchor, sid, d_idx, p))
                    for c2 in others:
                        v_other = x.get((c2, sid, d_idx, p))

                        if v_anchor is None and v_other is None:
                            # Both absent → both 0, already equal, nothing to add.
                            continue

                        if v_anchor is not None and v_other is not None:
                            # Both vars exist: force equality via mutual implication.
                            model.add_implication(v_anchor, v_other)
                            model.add_implication(v_other, v_anchor)

                        elif v_anchor is not None and v_other is None:
                            # anchor has a var but c2 has no slot here → anchor must be 0.
                            model.add(v_anchor == 0)

                        else:
                            # c2 has a var but anchor has no slot here → c2 must be 0.
                            model.add(v_other == 0)

    # ── 8c. Feasibility warning for under-constrained groups ─────────────
    #
    # A pooled session requires every involved class to have a candidate
    # variable at the SAME (d_idx, p).  A slot is only viable for the whole
    # group when none of the assigned teachers is marked unavailable at that
    # slot — i.e. a variable exists for every class in `involved`.
    #
    # Note: teacher double-booking is NO LONGER a limiting factor here —
    # pooled sessions are explicitly exempt (section 7).  The only real
    # constraint is per-class teacher unavailability, which is already
    # reflected by the presence/absence of x[(cid, sid, d_idx, p)].
    for grp in req.linkedClassGroups:
        if len(grp.classIds) < 2:
            continue
        for sid in grp.subjectIds:
            sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code
            # Only consider classes that actually have a requirement for this subject
            involved = [
                cid for cid in grp.classIds
                if any(r.classId == cid and r.subjectId == sid for r in req.requirements)
            ]
            if len(involved) < 2:
                continue

            # Count (d_idx, p) slots where ALL involved classes have a variable —
            # meaning every class's assigned teacher is available at that slot.
            common_slots = sum(
                1
                for d_idx in range(len(days))
                for p in range(num_periods)
                if all(x.get((cid, sid, d_idx, p)) is not None for cid in involved)
            )

            # How many pooled occurrences are needed?
            # (lessonsPerWeek is already the occurrence count — 1 per double-block)
            needed = next(
                (r.lessonsPerWeek for r in req.requirements
                 if r.classId == involved[0] and r.subjectId == sid),
                0,
            )
            subject = subject_by_id.get(sid)
            is_double = subject.doubleLesson if subject else False
            # For doubles each occurrence occupies 2 periods; variables are
            # created at the START period only, so needed_blocks == needed.
            needed_blocks = needed

            if common_slots < needed_blocks:
                class_names = [
                    class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
                    for cid in involved
                ]
                teachers_involved = ", ".join(
                    filter(None, {
                        teacher_by_id.get(
                            assignment_map.get((cid, sid), ""), Teacher(id="", name="")
                        ).name
                        for cid in involved
                        if assignment_map.get((cid, sid))
                    })
                )
                warnings.append(
                    f"Group sync: {sub_code} for {', '.join(class_names)} needs "
                    f"{needed_blocks} common {'double-block' if is_double else 'slot'}(s) "
                    f"but only {common_slots} exist where every class's teacher is free "
                    f"simultaneously (teachers: {teachers_involved}). "
                    f"Reduce teacher unavailability or assign additional teachers."
                )

    # ── 8d. Hard constraint: no class may have more than maxConsecutiveLessons ──
    #
    # class_slot_vars[(cid, d_idx, p)] already holds every BoolVar that
    # occupies physical period p for class cid on day d_idx (including the
    # p+1 entry of double-lesson variables, added in section 6).
    #
    # For every window of (max_consec + 1) consecutive physical periods we
    # require: sum(distinct vars in window) <= max_consec.
    # With the default max_consec = 2 this forbids any run of 3+ periods.
    max_consec = req.maxConsecutiveLessons
    if max_consec >= 1:
        # Group class_slot_vars by (cid, d_idx) → {p: [vars]}
        cid_day_map: dict[tuple[str, int], dict[int, list[cp_model.IntVar]]] = {}
        for (cid, d_idx, p), vars_here in class_slot_vars.items():
            cid_day_map.setdefault((cid, d_idx), {})[p] = vars_here

        constraints_added = 0
        for (cid, d_idx), period_vars in cid_day_map.items():
            if not period_vars:
                continue
            max_p = max(period_vars.keys())
            # Slide window of size (max_consec + 1)
            for w in range(max_p - max_consec + 1):
                seen_names: set[str] = set()
                deduped: list[cp_model.IntVar] = []
                for wp in range(w, w + max_consec + 1):
                    for vv in period_vars.get(wp, []):
                        if vv.name not in seen_names:
                            seen_names.add(vv.name)
                            deduped.append(vv)
                if len(deduped) > max_consec:
                    model.add(sum(deduped) <= max_consec)
                    constraints_added += 1
        log.info("8d: added %d no-triple-run constraints (max_consec=%d)", constraints_added, max_consec)

    # ── 8e. Hard constraint: no unintended consecutive singles ────────────────
    #
    # A subject that is NOT a double-lesson subject must never occupy two
    # consecutive periods for the same class on the same day.  Without this,
    # the solver may legally place two single lessons back-to-back (they don't
    # violate no-class-double-booking since they are different subjects... wait,
    # they ARE the same subject).  We add: for every non-double subject, for
    # every (class, day), for every pair of consecutive period indices p and p+1,
    #   x[(cid,sid,d,p)] + x[(cid,sid,d,p+1)] <= 1
    if req.preventUnintendedDoubles:
        non_double_sids: set[str] = {
            s.id for s in req.subjects if not s.doubleLesson
        }
        for (cid, sid, d_idx, p), v in x.items():
            if sid not in non_double_sids:
                continue
            # Check if there is a variable at p+1 for the same (class, subject, day)
            v_next = x.get((cid, sid, d_idx, p + 1))
            if v_next is not None:
                model.add(v + v_next <= 1)

    # ── 9. Objective ─────────────────────────────────────────────────────
    #
    # COVERAGE-FIRST design: the objective is structured so the solver always
    # prefers placing more lessons over satisfying any soft preference.
    #
    # Priority 1 (1 000 000) — complete a requirement fully.
    #   For each (class, subject) we add a BoolVar "req_complete[cid,sid]"
    #   that is 1 iff ALL needed occurrences are placed.  Completing a
    #   requirement earns 1 000 000 × needed (so it always dominates the
    #   per-slot rewards below and the solver tries to fill requirements
    #   whole rather than leaving every requirement one lesson short).
    #
    # Priority 2 (100 000) — place each individual lesson.
    #   Every x-variable earns 100 000 when placed (200 000 for doubles).
    #   Combined with P1, partially-filled requirements are still worth more
    #   than empty ones.
    #
    # Priority 3 (500 / 100) — session preferences (hard/soft).
    #   Hard preferences are rewarded but NEVER penalised for wrong session:
    #   the old -300 penalty caused the solver to drop lessons rather than
    #   place them in the wrong session.  Removed entirely.
    #
    # Priority 4 (10) — subject spread across days.
    #
    # Priority 5 (2) — teacher load balance.
    #
    objective_terms: list[tuple[cp_model.IntVar, int]] = []

    # P1 — requirement-completion bonus
    # req_complete[cid,sid] = 1  iff  sum(vars_list) == needed
    for (cid, sid), vars_list in req_vars.items():
        needed = req_needed.get((cid, sid), 0)
        if not vars_list or needed == 0:
            continue
        rc = model.new_bool_var(f"rc_{cid}_{sid}")
        # rc == 1  ⟺  sum(vars_list) >= needed
        # (sum is already capped at needed by section 5, so >= needed means == needed)
        model.add(sum(vars_list) >= needed).only_enforce_if(rc)
        model.add(sum(vars_list) < needed).only_enforce_if(rc.negated())
        # Bonus = 1 000 000 × needed so a full 5-lesson requirement outweighs
        # a full 1-lesson one and the solver prioritises completing heavy subjects.
        objective_terms.append((rc, 1_000_000 * needed))

    # P2 — per-lesson placement reward
    for (cid, sid, d_idx, p), v in x.items():
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        slot_weight = 200_000 if is_double else 100_000
        objective_terms.append((v, slot_weight))

    # P3 — session preferences (reward only, no penalty for wrong session)
    for (cid, sid, d_idx, p), v in x.items():
        sub = subject_by_id.get(sid)
        if sub is None:
            continue
        pref = session_pref_map.get(sub.code.upper())
        if pref is None:
            continue
        slot_session = period_session[p] if p < len(period_session) else None
        if slot_session == pref.preferredSession:
            # Reward correct session; never penalise wrong session so lessons
            # are never dropped just to satisfy a session preference.
            objective_terms.append((v, 500 if pref.isHard else 100))

    # P4 — subject spread across days (reward placing same subject on a new day)
    cs_day_x: dict[tuple[str, str, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        cs_day_x.setdefault((cid, sid, d_idx), []).append(v)

    for key, day_xs in cs_day_x.items():
        sv = model.new_bool_var(f"spread_{'_'.join(map(str, key))}")
        model.add_bool_or([*day_xs, sv.negated()])
        for xv in day_xs:
            model.add_implication(xv, sv)
        objective_terms.append((sv, 10))

    # P5 — teacher load balance (even spread across days)
    for (tid, d_idx), wvars in teacher_day_vars.items():
        half = effective_cap_for.get(tid, req.maxLessonsPerTeacherPerDay) // 2
        bal_v = model.new_bool_var(f"bal_{tid}_{d_idx}")
        vars_only = [v for v, _ in wvars]
        reps_set = set(r.name for r in _cluster_representatives(vars_only, pooled_pair_keys))
        deduped_wvars = [(v, w) for v, w in wvars if v.name in reps_set]
        model.add(sum(v * w for v, w in deduped_wvars) <= half).only_enforce_if(bal_v)
        model.add(sum(v * w for v, w in deduped_wvars) > half).only_enforce_if(bal_v.negated())
        objective_terms.append((bal_v, 2))

    # Stability (weight 1) — reward keeping previousSlots positions.
    # Weight 1 is below P5=2 so it never displaces a better-balanced schedule,
    # but it breaks ties in favour of the previous solution.
    prev_lookup: set[tuple[str, str, int, int]] = {
        (ps.classId, ps.subjectId, ps.dayOfWeek, ps.period)
        for ps in req.previousSlots
    }
    for (cid, sid, d_idx, p), v in x.items():
        day = days[d_idx]
        # period is 1-based: p (0-based) → p+1 (1-based)
        if (cid, sid, day, p + 1) in prev_lookup:
            objective_terms.append((v, 1))

    if objective_terms:
        model.maximize(sum(w * v for v, w in objective_terms))

    # ── 9b. Greedy warm-start heuristic ──────────────────────────────────
    #
    # Sort requirements by number of candidate slots ascending (scarcest first).
    # This mimics a greedy timetabler: hard-to-place subjects get priority.
    # After the greedy pass, we hint 1 for chosen slots and 0 for unchosen
    # candidates of the same requirement.
    reqs_sorted_by_scarcity = sorted(
        req_vars.items(), key=lambda kv: len(kv[1])
    )
    greedy_chosen: dict[tuple[str, str], set[tuple[int, int]]] = {}
    class_occupied_greedy: set[tuple[str, int, int]] = set()    # (cid, d_idx, p)
    teacher_occupied_greedy: set[tuple[str, int, int]] = set()  # (tid, d_idx, p)

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
            class_clear = (cid, d_idx, p) not in class_occupied_greedy
            teacher_clear = tid is None or (tid, d_idx, p) not in teacher_occupied_greedy
            if class_clear and teacher_clear:
                chosen.append((d_idx, p))
                class_occupied_greedy.add((cid, d_idx, p))
                if tid:
                    teacher_occupied_greedy.add((tid, d_idx, p))
                if is_double:
                    class_occupied_greedy.add((cid, d_idx, p + 1))
                    if tid:
                        teacher_occupied_greedy.add((tid, d_idx, p + 1))
        greedy_chosen[(cid, sid)] = set(chosen)

    # Also collect previousSlots positions to additionally hint from warm-start
    prev_slots_set: set[tuple[str, str, int, int]] = {
        (ps.classId, ps.subjectId, ps.dayOfWeek, ps.period)
        for ps in req.previousSlots
    }

    warm_start_hints = 0
    # Apply hints: greedy-chosen slots get hint=1; uncovered candidates get hint=0
    for (cid, sid), vars_list in req_vars.items():
        chosen_slots = greedy_chosen.get((cid, sid), set())
        for v in vars_list:
            key = var_to_key.get(id(v))
            if key is None:
                continue
            _, _, d_idx, p = key
            day = days[d_idx]
            if (d_idx, p) in chosen_slots:
                model.add_hint(v, 1)
                warm_start_hints += 1
            elif (cid, sid, day, p + 1) in prev_slots_set:
                # Additional warm-start from previousSlots stability
                model.add_hint(v, 1)
                warm_start_hints += 1
            else:
                model.add_hint(v, 0)

    # ── 10a. Build idle-period BoolVars ──────────────────────────────────
    #
    # For each (teacher, day) pair we build:
    #   has_lesson[(tid, d_idx, p)] = 1 iff teacher has at least one lesson at period p
    #   idle[(tid, d_idx, p)]       = 1 iff period p is an interior gap on that day
    #
    # An interior gap is a period with no lesson that lies strictly between
    # the teacher's first and last lesson on that day.
    #
    # Uses _cluster_representatives to deduplicate pooled sessions — a teacher
    # co-teaching multiple classes at the same slot counts as ONE lesson.
    idle_period_vars: list[cp_model.IntVar] = []
    # Track all idle vars per (tid, d_idx) for telemetry
    idle_per_teacher_day: dict[tuple[str, int], list[cp_model.IntVar]] = {}

    # Group variables by (tid, d_idx)
    td_vars: dict[tuple[str, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p_), v in x.items():
        tid = assignment_map.get((cid, sid))
        if tid is None:
            continue
        td_vars.setdefault((tid, d_idx), []).append(v)

    for (tid, d_idx), all_vars in td_vars.items():
        # Deduplicate pooled clusters
        reps = _cluster_representatives(all_vars, pooled_pair_keys)
        if len(reps) < 2:
            # 0 or 1 lesson variables: no interior gaps possible
            continue

        # Build has_lesson[p] for each period 0..num_periods-1
        has_lesson: list[cp_model.IntVar] = []
        for p_ in range(num_periods):
            # Collect representative variables that land on period p_
            # (including double-lesson vars that land at p_ via their start at p_-1)
            p_vars: list[cp_model.IntVar] = []
            for rv in reps:
                key = var_to_key.get(id(rv))
                if key is None:
                    continue
                _, _, di, rp = key
                if di != d_idx:
                    continue
                subj = subject_by_id.get(key[1])
                is_dbl = subj.doubleLesson if subj else False
                # This variable occupies period rp; if double also rp+1
                if rp == p_ or (is_dbl and rp + 1 == p_):
                    p_vars.append(rv)

            hl = model.new_bool_var(f"hl_{tid}_{d_idx}_{p_}")
            if p_vars:
                # hl == 1 iff at least one p_var is 1
                model.add_bool_or([*p_vars, hl.negated()])
                for pv in p_vars:
                    model.add_implication(pv, hl)
            else:
                model.add(hl == 0)
            has_lesson.append(hl)

        # Build idle[p] for interior periods (1 .. num_periods-2)
        day_idle: list[cp_model.IntVar] = []
        for p_ in range(1, num_periods - 1):
            idle = model.new_bool_var(f"idle_{tid}_{d_idx}_{p_}")

            # has_before[p_]: any lesson strictly before p_
            has_before = model.new_bool_var(f"hbef_{tid}_{d_idx}_{p_}")
            before_vars = has_lesson[:p_]
            if before_vars:
                model.add_bool_or([*before_vars, has_before.negated()])
                for hl in before_vars:
                    model.add_implication(hl, has_before)
            else:
                model.add(has_before == 0)

            # has_after[p_]: any lesson strictly after p_
            has_after = model.new_bool_var(f"haft_{tid}_{d_idx}_{p_}")
            after_vars = has_lesson[p_ + 1:]
            if after_vars:
                model.add_bool_or([*after_vars, has_after.negated()])
                for hl in after_vars:
                    model.add_implication(hl, has_after)
            else:
                model.add(has_after == 0)

            # idle = has_before AND has_after AND NOT has_lesson[p_]
            model.add_bool_and([has_before, has_after, has_lesson[p_].negated()]).only_enforce_if(idle)
            model.add(idle == 0).only_enforce_if(idle.negated())
            model.add_implication(idle, has_before)
            model.add_implication(idle, has_after)
            model.add_implication(idle, has_lesson[p_].negated())

            idle_period_vars.append(idle)
            day_idle.append(idle)

        if day_idle:
            idle_per_teacher_day[(tid, d_idx)] = day_idle

    log.info("10a: built %d idle-period vars across %d teacher-day pairs",
             len(idle_period_vars), len(idle_per_teacher_day))

    # ── 10. Sequential Two-Phase Solve ───────────────────────────────────
    #
    # Tier 1 (60% of time budget): maximise coverage (P1+P2 + stability).
    #   The existing objective (built in §9) already has all terms; we use it
    #   directly on the original model.  After solving, we record how many
    #   physical lesson slots were placed and add a hard floor constraint so
    #   Tier 2 cannot sacrifice coverage for quality.
    #
    # Tier 2 (35% of time budget): minimise idle periods.
    #   We replace the objective with model.minimize(idle_period_vars) and
    #   solve again on the same model (same variables + constraints + floor).
    #
    # If Tier 1 finds nothing, we skip the floor and run Tier 2 with remaining
    # budget on the original coverage objective.
    tier1_budget = req.timeLimitSeconds * 0.60
    tier2_budget = req.timeLimitSeconds * 0.35

    num_workers = max(1, os.cpu_count() or 1)

    log.info(
        "Solving: %d classes, %d subjects, %d teachers, %d days × %d periods, "
        "%d variables, %d valid double-lesson start positions, "
        "%d linked-class groups  |  Tier1=%.1fs  Tier2=%.1fs",
        len(req.classes), len(req.subjects), len(req.teachers),
        len(days), num_periods, len(x), len(valid_double_starts),
        len(req.linkedClassGroups), tier1_budget, tier2_budget,
    )

    # ── Tier 1: maximise coverage ─────────────────────────────────────────
    tier1_solver = cp_model.CpSolver()
    tier1_solver.parameters.max_time_in_seconds = tier1_budget
    tier1_solver.parameters.num_workers = num_workers
    tier1_solver.parameters.log_search_progress = False
    tier1_solver.parameters.random_seed = 42

    tier1_status = tier1_solver.solve(model)
    tier1_feasible = tier1_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    tier1_wall = tier1_solver.wall_time

    log.info("Tier 1 (coverage): %s  (wall=%.2fs)",
             tier1_solver.status_name(tier1_status), tier1_wall)

    # Count physical slots placed by Tier 1
    achieved_physical = 0
    if tier1_feasible:
        for v in x.values():
            try:
                achieved_physical += tier1_solver.value(v)
            except Exception:
                pass

    # ── Lock coverage floor ────────────────────────────────────────────────
    # Add hard lower bound: Tier 2 must place at least as many physical slots.
    if tier1_feasible and achieved_physical > 0:
        all_x_vars = list(x.values())
        model.add(sum(all_x_vars) >= achieved_physical)
        # Warm-start Tier 2 from Tier 1's solution
        for v in x.values():
            try:
                model.add_hint(v, tier1_solver.value(v))
            except Exception:
                pass
    elif not tier1_feasible:
        warnings.append(
            "Tier 1 time limit reached without a feasible solution. "
            "Tier 2 will run without coverage floor."
        )

    # ── Tier 2: minimise idle periods ──────────────────────────────────────
    if idle_period_vars:
        model.minimize(sum(idle_period_vars))
    # If no idle vars, keep existing objective (Tier 2 is a no-op extension)

    tier2_solver = cp_model.CpSolver()
    tier2_solver.parameters.max_time_in_seconds = tier2_budget
    tier2_solver.parameters.num_workers = num_workers
    tier2_solver.parameters.log_search_progress = False
    tier2_solver.parameters.random_seed = 42

    tier2_status = tier2_solver.solve(model)
    tier2_feasible = tier2_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    tier2_wall = tier2_solver.wall_time

    log.info("Tier 2 (idle-min): %s  (wall=%.2fs)",
             tier2_solver.status_name(tier2_status), tier2_wall)

    # Use Tier 2 result if feasible, otherwise fall back to Tier 1
    if tier2_feasible:
        solver = tier2_solver
        feasible = True
    elif tier1_feasible:
        solver = tier1_solver
        feasible = True
    else:
        # Neither tier found anything — use Tier 2's solver for status/stats
        solver = tier2_solver
        feasible = False

    status_name = solver.status_name(tier2_status if tier2_feasible else tier1_status)

    # ── 11. Extract solution ─────────────────────────────────────────────
    slots_out: list[GeneratedSlot] = []

    if feasible:
        for (cid, sid, d_idx, p), v in x.items():
            if solver.value(v) != 1:
                continue
            day = days[d_idx]
            subject = subject_by_id.get(sid)
            tid = assignment_map.get((cid, sid), "")
            is_double = subject.doubleLesson if subject else False
            room = subject.requiresSpecialRoom if subject else None

            slots_out.append(GeneratedSlot(
                classId=cid, dayOfWeek=day, period=p + 1,
                subjectId=sid, teacherId=tid, room=room,
            ))
            if is_double:
                slots_out.append(GeneratedSlot(
                    classId=cid, dayOfWeek=day, period=p + 2,
                    subjectId=sid, teacherId=tid, room=room,
                ))

    # ── 12. Shortfall warnings + extended stats ──────────────────────────
    # Count occurrences placed per (class, subject).
    # For doubles, the solver emits 2 physical slots per occurrence; we divide
    # back to occurrence count so the comparison is against lessonsPerWeek.
    placed_physical: dict[tuple[str, str], int] = {}
    for s in slots_out:
        key = (s.classId, s.subjectId)
        placed_physical[key] = placed_physical.get(key, 0) + 1

    total_required = 0
    total_scheduled = 0
    requirements_fully_completed = 0
    total_requirements = 0

    for r in req.requirements:
        cid, sid = r.classId, r.subjectId
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False

        # Convert physical slots placed back to occurrence count for doubles
        physical = placed_physical.get((cid, sid), 0)
        placed = physical // 2 if is_double else physical
        # physical slots required = lessonsPerWeek * (2 for doubles, 1 for singles)
        required_physical = r.lessonsPerWeek * (2 if is_double else 1)

        total_required  += required_physical
        total_scheduled += physical   # both in physical slots for the rate
        total_requirements += 1
        if placed >= r.lessonsPerWeek:
            requirements_fully_completed += 1

        if placed < r.lessonsPerWeek:
            cls_name = class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
            sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code
            shortfall = r.lessonsPerWeek - placed
            tid = assignment_map.get((cid, sid))
            unit = "double-block" if is_double else "lesson"
            if tid:
                tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
                warnings.append(
                    f"{sub_code} for {cls_name}: scheduled {placed}/{r.lessonsPerWeek} "
                    f"{unit}{'s' if r.lessonsPerWeek != 1 else ''} (short by {shortfall}). "
                    f"Teacher: {tname!r}. "
                    f"Fix: reduce teacher unavailability or assign an additional teacher."
                )
            else:
                warnings.append(
                    f"{sub_code} for {cls_name}: 0/{r.lessonsPerWeek} {unit}s scheduled "
                    f"(no teacher assigned)."
                )

    completion_rate = (
        round(total_scheduled / total_required * 100, 2) if total_required else 100.0
    )
    lesson_placement_rate = completion_rate  # same metric, second key for clarity
    requirements_completion_rate = (
        round(requirements_fully_completed / total_requirements * 100, 2)
        if total_requirements else 100.0
    )

    if total_scheduled < total_required:
        log.warning(
            "Partial timetable: %d/%d lessons placed (%.1f%%).",
            total_scheduled, total_required, completion_rate,
        )

    # ── Idle-period telemetry ─────────────────────────────────────────────
    idle_periods_minimised = 0
    teacher_days_with_lessons = 0
    total_idle_count = 0

    if feasible and idle_period_vars:
        for iv in idle_period_vars:
            try:
                val = solver.value(iv)
                if val == 0:
                    idle_periods_minimised += 1
                else:
                    total_idle_count += 1
            except Exception:
                pass

    # Count (teacher, day) pairs that have at least one lesson
    for (tid, d_idx) in td_vars:
        reps = _cluster_representatives(td_vars[(tid, d_idx)], pooled_pair_keys)
        if feasible and any(
            (solver.value(rv) == 1) for rv in reps
            if (lambda rv=rv: (lambda: solver.value(rv))())()
        ):
            teacher_days_with_lessons += 1

    avg_teacher_gaps_per_day = (
        round(total_idle_count / teacher_days_with_lessons, 2)
        if teacher_days_with_lessons > 0
        else 0.0
    )

    # ── Load-balance score (P5) ────────────────────────────────────────────
    # Compute from the balance variables built in §9 (P5).
    # We don't have a direct reference to them here, so approximate from
    # teacher day load data.
    load_balance_score = 0.0
    total_bal_checks = 0
    balanced_count = 0
    if feasible:
        for (tid_, d_idx_), wvars in teacher_day_vars.items():
            cap_ = effective_cap_for.get(tid_, req.maxLessonsPerTeacherPerDay)
            half_ = cap_ // 2
            vars_only_ = [v for v, _ in wvars]
            reps_ = set(r.name for r in _cluster_representatives(vars_only_, pooled_pair_keys))
            deduped_ = [(v, w) for v, w in wvars if v.name in reps_]
            try:
                day_load = sum(solver.value(v) * w for v, w in deduped_)
                total_bal_checks += 1
                if day_load <= half_:
                    balanced_count += 1
            except Exception:
                pass
    load_balance_score = (
        round(balanced_count / total_bal_checks * 100, 2) if total_bal_checks else 0.0
    )

    # ── previousSlots retained ─────────────────────────────────────────────
    previous_slots_retained = 0
    if feasible and req.previousSlots:
        prev_set = {
            (ps.classId, ps.subjectId, ps.dayOfWeek, ps.period)
            for ps in req.previousSlots
        }
        for s in slots_out:
            if (s.classId, s.subjectId, s.dayOfWeek, s.period) in prev_set:
                previous_slots_retained += 1

    return SolverResponse(
        # Always report FEASIBLE so the Next.js layer accepts and saves the result.
        # Shortfalls are communicated through warnings and stats.
        status="FEASIBLE",
        slots=slots_out,
        warnings=warnings,
        stats={
            # Core stats (backward-compatible)
            "totalLessonsScheduled": total_scheduled,
            "totalLessonsRequired": total_required,
            "completionRate": completion_rate,
            "wallTime": tier1_wall + tier2_wall,
            "branches": tier2_solver.num_branches + tier1_solver.num_branches,
            "conflicts": tier2_solver.num_conflicts + tier1_solver.num_conflicts,
            "objectiveValue": (
                solver.objective_value
                if feasible and hasattr(solver, "objective_value")
                else 0
            ),
            # Per-tier telemetry (Phase 3)
            "tier1WallTime": tier1_wall,
            "tier2WallTime": tier2_wall,
            "idlePeriodsMinimised": idle_periods_minimised,
            "warmStartHints": warm_start_hints,
            "lockedSlotsApplied": locked_slots_applied,
            "previousSlotsRetained": previous_slots_retained,
            # Requirement 10 stats
            "requirementsCompletionRate": requirements_completion_rate,
            "lessonPlacementRate": lesson_placement_rate,
            "avgTeacherGapsPerDay": avg_teacher_gaps_per_day,
            "loadBalanceScore": load_balance_score,
        },
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    # Railway injects $PORT at runtime.  SOLVER_PORT is a fallback for local
    # dev and Docker Compose.  The service always binds to 0.0.0.0 so Railway's
    # reverse proxy can reach it.
    port = int(os.getenv("PORT", os.getenv("SOLVER_PORT", "8080")))
    uvicorn.run(
        "solver:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )
