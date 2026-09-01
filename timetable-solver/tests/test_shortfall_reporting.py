"""
timetable-solver/tests/test_shortfall_reporting.py

Validates Property 8: Shortfall Warning Arithmetic.

For any partially-scheduled (classId, subjectId) pair, the shortfall warning
message SHALL report a placed count X that equals the number of slots for that
pair in the output, and shortfall == lessonsPerWeek - placed.

Feature: cp-sat-engine-upgrade, Property 8: Shortfall Warning Arithmetic
Validates: Requirements 1.9
"""
import re
import sys
import os

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
    TemplateColumn,
)
from tests.conftest import make_template


def _build_shortfall_request() -> SolverRequest:
    """
    1 class (c1), 1 subject (MATH, doubleLesson=False, lessonsPerWeek=5),
    1 teacher (t1).

    Available slots: operatingDays=[1,2,3] × make_template(1) = 3 slots total.
    lessonsPerWeek=5 > 3 available → forced shortfall of 2, placed = 3.
    """
    return SolverRequest(
        subjects=[
            Subject(id="s1", code="MATH", internalCode=1, doubleLesson=False),
        ],
        classes=[
            SchoolClass(id="c1", name="1A", form=1, streamIndex=0),
        ],
        teachers=[
            Teacher(id="t1", name="Alice"),
        ],
        requirements=[
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=5),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
        ],
        templateColumns=make_template(1),   # 1 period per day
        operatingDays=[1, 2, 3],            # 3 days → 3 slots total
        timeLimitSeconds=10.0,
    )


def test_shortfall_arithmetic():
    """
    Requirement 1.9 — shortfall warning arithmetic.

    With only 3 slots available but 5 required:
      placed + shortfall must equal lessonsPerWeek (5).
    Also verifies totalLessonsRequired >= totalLessonsScheduled in stats.
    """
    req = _build_shortfall_request()
    resp = _solve(req)

    # Count placed slots for (c1, s1) from the output
    placed = sum(
        1 for s in resp.slots
        if s.classId == "c1" and s.subjectId == "s1"
    )

    # Find the warning that mentions "short by"
    shortfall_warnings = [w for w in resp.warnings if "short by" in w]
    assert shortfall_warnings, (
        f"Expected a 'short by' warning but got: {resp.warnings}"
    )

    # Parse the shortfall value from "short by N"
    match = re.search(r"short by (\d+)", shortfall_warnings[0])
    assert match, (
        f"Could not parse 'short by N' from warning: {shortfall_warnings[0]!r}"
    )
    shortfall = int(match.group(1))

    # Core invariant: placed + shortfall == lessonsPerWeek
    assert placed + shortfall == 5, (
        f"Arithmetic mismatch: placed={placed} + shortfall={shortfall} != 5. "
        f"Warning: {shortfall_warnings[0]!r}"
    )

    # Sanity check: placed must not exceed available slots (3)
    assert placed <= 3, f"Placed {placed} exceeds 3 available slots"

    # Stats invariant: required >= scheduled
    assert resp.stats["totalLessonsRequired"] >= resp.stats["totalLessonsScheduled"], (
        "totalLessonsRequired should be >= totalLessonsScheduled"
    )
