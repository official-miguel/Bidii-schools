"""
timetable-solver/tests/test_group_sync.py

Tests for LinkedClassGroup synchronisation (Requirement 1.3 / Property 3).

The solver must place every group subject for all classes in a linked group
at the SAME (dayOfWeek, period).  These tests verify:

  - test_group_sync_same_slot:
      Any slots placed for the group subject appear at the same (dayOfWeek, period)
      across all classes in the group.  If 0 lessons are placed the test still
      passes — there are no slots to violate the constraint.

  - test_group_sync_warning_when_under_constrained:
      When t1 is unavailable for ALL periods on days 1, 2, 3, common viable
      slots drop significantly.  The solver must emit a "Group sync:" warning.
"""

import sys
import os

# Ensure solver.py is importable regardless of the working directory.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from solver import (
    _solve,
    SolverRequest,
    Subject,
    SchoolClass,
    Teacher,
    SubjectRequirement,
    TeacherAssignment,
    TeacherUnavailability,
    LinkedClassGroup,
)

# Re-use make_template from conftest (imported via conftest.py auto-discovery),
# but also define a local import path for clarity.
from tests.conftest import make_template  # noqa: E402


# ---------------------------------------------------------------------------
# Shared fixture builder
# ---------------------------------------------------------------------------

def _build_request(t1_unavailability: list[TeacherUnavailability]) -> SolverRequest:
    """
    Minimal request with:
      - 2 classes:  c1, c2
      - 1 subject:  s1 (MATH, single lesson)
      - 2 teachers: t1 (teaches s1 to c1), t2 (teaches s1 to c2)
      - LinkedClassGroup: {classIds: [c1, c2], subjectIds: [s1]}
      - lessonsPerWeek = 2 for both c1 and c2
      - 5-day week, 8-period template
    """
    return SolverRequest(
        subjects=[
            Subject(id="s1", code="MATH", internalCode=1, doubleLesson=False),
        ],
        classes=[
            SchoolClass(id="c1", name="1A", form=1, streamIndex=0),
            SchoolClass(id="c2", name="2A", form=2, streamIndex=0),
        ],
        teachers=[
            Teacher(id="t1", name="Alice"),
            Teacher(id="t2", name="Bob"),
        ],
        requirements=[
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=2),
            SubjectRequirement(classId="c2", subjectId="s1", lessonsPerWeek=2),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
            TeacherAssignment(classId="c2", subjectId="s1", teacherId="t2"),
        ],
        teacherUnavailability=t1_unavailability,
        linkedClassGroups=[
            LinkedClassGroup(subjectIds=["s1"], classIds=["c1", "c2"]),
        ],
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
    )


# ---------------------------------------------------------------------------
# Test 1 — placed slots for the group subject are synchronised
# ---------------------------------------------------------------------------

def test_group_sync_same_slot():
    """
    Property 3: for every (dayOfWeek, period) combination occupied by the
    group subject (s1), both c1 and c2 must have a slot there — and the
    converse: if one class has no slot at that position, neither should the
    other.

    We restrict t1 (teacher for c1) from days 1-3, period 1 (1-based) to
    reduce viable common slots, exercising the constraint non-trivially.

    If the solver places 0 lessons the test passes vacuously — there are
    no placed slots to violate the sync invariant.
    """
    # Make t1 unavailable for period 1 (1-based) on days 1, 2, 3
    t1_unavail = [
        TeacherUnavailability(teacherId="t1", dayOfWeek=d, period=1)
        for d in [1, 2, 3]
    ]
    response = _solve(_build_request(t1_unavail))

    # Gather all placed slots for s1, keyed by (dayOfWeek, period)
    s1_slots = [s for s in response.slots if s.subjectId == "s1"]

    # Build a mapping: (dayOfWeek, period) -> set of classIds
    slot_to_classes: dict[tuple[int, int], set[str]] = {}
    for slot in s1_slots:
        key = (slot.dayOfWeek, slot.period)
        slot_to_classes.setdefault(key, set()).add(slot.classId)

    # For every slot position that appears in the output, both c1 and c2
    # must be present (group sync constraint).
    for (day, period), classes_there in slot_to_classes.items():
        assert "c1" in classes_there and "c2" in classes_there, (
            f"Group sync violated at day={day} period={period}: "
            f"found classes {classes_there}, expected both c1 and c2"
        )


# ---------------------------------------------------------------------------
# Test 2 — solver emits "Group sync:" warning when common slots are scarce
# ---------------------------------------------------------------------------

def test_group_sync_warning_when_under_constrained():
    """
    When t1 is unavailable for ALL 8 periods on days 1, 2, 3, the number of
    common viable slots (where both t1 for c1 and t2 for c2 are available)
    drops to only 2 days × 8 periods = 16, but the group sync constraint
    further limits it to slots where t1 is free — only days 4 and 5.

    We require 2 lessons/week, but with heavy unavailability the solver
    should detect fewer common slots than needed and emit a "Group sync:"
    warning.

    Strategy: block t1 on ALL periods of days 1–3, leaving only days 4 and 5
    (16 common slots total, still ≥ 2 needed, so we need to block further).
    Block t1 on ALL periods of days 1–4, leaving only 8 slots on day 5
    (still enough). To guarantee the warning fires, block t1 on 7 out of 8
    periods on day 5 as well, leaving only 1 common slot when 2 are needed.
    """
    # t1 unavailable for ALL periods (1-8) on days 1, 2, 3
    # plus 7 of 8 periods on days 4 and 5 → only 1 common slot total
    # (need 2 lessons/week → solver must warn)
    t1_unavail: list[TeacherUnavailability] = []
    for day in [1, 2, 3, 4, 5]:
        for period in range(1, 8):  # periods 1-7 unavailable; period 8 free on day 5 only
            if day in [1, 2, 3, 4]:
                # All 8 periods blocked on days 1-4
                t1_unavail.append(
                    TeacherUnavailability(teacherId="t1", dayOfWeek=day, period=period)
                )
            else:
                # Days 5: block periods 1-7 (leave only period 8)
                t1_unavail.append(
                    TeacherUnavailability(teacherId="t1", dayOfWeek=day, period=period)
                )
    # Also block period 8 on days 1-4 for completeness
    for day in [1, 2, 3, 4]:
        t1_unavail.append(
            TeacherUnavailability(teacherId="t1", dayOfWeek=day, period=8)
        )

    # Now t1 is free only on day 5 period 8 → only 1 common slot, need 2
    response = _solve(_build_request(t1_unavail))

    warning_texts = " | ".join(response.warnings)
    assert any("Group sync:" in w for w in response.warnings), (
        f"Expected a 'Group sync:' warning when common slots < needed.\n"
        f"Got warnings: {warning_texts!r}"
    )
