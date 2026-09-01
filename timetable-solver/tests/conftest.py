"""
timetable-solver/tests/conftest.py

Shared fixtures and factory functions for the CP-SAT solver test suite.
All tests import _solve and models directly from solver.py (no HTTP layer).
"""
import sys
import os

# Make solver.py importable when pytest is run from any working directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from solver import (
    SolverRequest,
    Subject,
    SchoolClass,
    Teacher,
    SubjectRequirement,
    TeacherAssignment,
    TeacherUnavailability,
    TemplateColumn,
    SessionPreference,
    LinkedClassGroup,
    LockedSlot,
    PreviousSlot,
)


def make_template(n_lessons: int = 8, break_after: int = None):
    """
    Build a TemplateColumn list with LESSON columns and an optional BREAK column.

    Parameters
    ----------
    n_lessons : int
        Number of LESSON columns to create.
    break_after : int or None
        If given, insert a BREAK column *after* the lesson at this 0-based lesson
        index.  Template positions are absolute across all column types, so a
        break_after=1 produces:

            pos 0: LESSON  (lesson index 0)
            pos 1: LESSON  (lesson index 1)
            pos 2: BREAK
            pos 3: LESSON  (lesson index 2)
            pos 4: LESSON  (lesson index 3)
            ...

        This means lessons at lesson-indices 1 and 2 are NOT adjacent in the
        template (positions 1 and 3 differ by 2, not 1), so a double lesson
        cannot span that break.

    Returns
    -------
    list[TemplateColumn]
    """
    cols = []
    pos = 0
    for i in range(n_lessons):
        cols.append(
            TemplateColumn(
                position=pos,
                startTime="08:00",
                endTime="08:45",
                slotType="LESSON",
                session="MORNING",
                label=None,
            )
        )
        pos += 1
        if break_after is not None and i == break_after:
            cols.append(
                TemplateColumn(
                    position=pos,
                    startTime="08:45",
                    endTime="09:00",
                    slotType="BREAK",
                    session="MORNING",
                    label=None,
                )
            )
            pos += 1
    return cols


@pytest.fixture
def minimal_school():
    """
    Two classes, two subjects, two teachers, 5-day week, 8-period day.

    Requirements:
      c1 (1A) → s1 (MATH)  3 lessons/week  taught by t1 (Alice)
      c1 (1A) → s2 (ENG)   2 lessons/week  taught by t2 (Bob)
      c2 (2A) → s1 (MATH)  3 lessons/week  taught by t1 (Alice)
      c2 (2A) → s2 (ENG)   2 lessons/week  taught by t2 (Bob)
    """
    return SolverRequest(
        subjects=[
            Subject(id="s1", code="MATH", internalCode=1, doubleLesson=False),
            Subject(id="s2", code="ENG",  internalCode=2, doubleLesson=False),
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
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=3),
            SubjectRequirement(classId="c1", subjectId="s2", lessonsPerWeek=2),
            SubjectRequirement(classId="c2", subjectId="s1", lessonsPerWeek=3),
            SubjectRequirement(classId="c2", subjectId="s2", lessonsPerWeek=2),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
            TeacherAssignment(classId="c1", subjectId="s2", teacherId="t2"),
            TeacherAssignment(classId="c2", subjectId="s1", teacherId="t1"),
            TeacherAssignment(classId="c2", subjectId="s2", teacherId="t2"),
        ],
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
    )
