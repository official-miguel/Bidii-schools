"""
timetable-solver/tests/test_session_preference_guard.py

Regression guard for the old -300 penalty bug where a wrong-session
preference caused the solver to DROP lessons rather than place them in
the non-preferred session.

Validates Property 6: Session Preference Never Drops a Lesson.

When the ONLY available slots for a subject are in the wrong session,
the solver MUST still place all required lessons.

Feature: cp-sat-engine-upgrade, Property 6: Session Preference Never Drops a Lesson
Validates: Requirements 1.10
"""
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
    SessionPreference,
)


def _build_afternoon_only_request() -> SolverRequest:
    """
    All LESSON slots are session="AFTERNOON" — no MORNING slots exist.
    SessionPreference: MATH prefers MORNING, but isHard=False.
    Requirement: c1 needs 3 MATH lessons/week.

    The solver must still place all 3 lessons in AFTERNOON (the only available
    session), rather than leaving them unscheduled because of the MORNING preference.
    """
    # Build template manually: 8 AFTERNOON lesson slots (no MORNING slots at all)
    cols = [
        TemplateColumn(
            position=i,
            startTime="14:00",
            endTime="14:45",
            slotType="LESSON",
            session="AFTERNOON",
            label=None,
        )
        for i in range(8)
    ]

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
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=3),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
        ],
        sessionPreferences=[
            SessionPreference(
                subjectCode="MATH",
                preferredSession="MORNING",
                isHard=False,
            ),
        ],
        templateColumns=cols,
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
    )


def test_session_preference_never_drops_lesson():
    """
    Property 6 regression guard.

    A soft session preference for MORNING must NEVER cause a lesson to be
    dropped when only AFTERNOON slots are available.  All 3 required lessons
    must still be placed (in AFTERNOON).
    """
    req = _build_afternoon_only_request()
    resp = _solve(req)

    placed = sum(
        1 for s in resp.slots
        if s.classId == "c1" and s.subjectId == "s1"
    )

    assert placed == 3, (
        f"Expected 3 lessons placed for MATH/c1, but only got {placed}. "
        f"A session preference for MORNING must never drop lessons when "
        f"only AFTERNOON slots are available. Warnings: {resp.warnings}"
    )
