"""
timetable-solver/tests/test_adaptive_cap.py

Property: Adaptive daily cap.

Feature: cp-sat-engine-upgrade
Validates: Requirements 1.8

When a teacher's total weekly lessons exceed maxLessonsPerTeacherPerDay × days,
the solver raises the cap to ceil(total / days) and emits a warning containing
"cap raised".

Fixture:
  - 1 class (c1), 2 subjects (MATH 7/week, ENG 5/week = 12 total)
  - 1 teacher (t1) assigned to both subjects
  - maxLessonsPerTeacherPerDay=2, operatingDays=[1,2,3,4,5]
  - 2 × 5 = 10 capacity < 12 required → ceil(12/5) = 3, cap raised to 3
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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

try:
    from conftest import make_template
except ImportError:
    def make_template(num_lessons: int = 8, break_after=None) -> list:
        cols = []
        pos = 0
        for i in range(num_lessons):
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


def test_adaptive_cap_raises():
    """
    Validates: Requirements 1.8

    1 class (c1), 2 subjects (MATH 7/week, ENG 5/week = 12 total lessons).
    1 teacher (t1) assigned to both subjects.
    maxLessonsPerTeacherPerDay=2, operatingDays=[1,2,3,4,5] (5 days).

    Max capacity at configured cap = 2 × 5 = 10 < 12 required.
    Solver must raise cap to ceil(12/5) = 3 and emit a warning containing
    "cap raised".
    """
    req = SolverRequest(
        subjects=[
            Subject(id="s1", code="MATH", internalCode=1, doubleLesson=False),
            Subject(id="s2", code="ENG",  internalCode=2, doubleLesson=False),
        ],
        classes=[
            SchoolClass(id="c1", name="1A", form=1, streamIndex=0),
        ],
        teachers=[
            Teacher(id="t1", name="Alice"),
        ],
        requirements=[
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=7),
            SubjectRequirement(classId="c1", subjectId="s2", lessonsPerWeek=5),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
            TeacherAssignment(classId="c1", subjectId="s2", teacherId="t1"),
        ],
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        maxLessonsPerTeacherPerDay=2,
        timeLimitSeconds=10.0,
    )

    resp = _solve(req)

    cap_raised_warnings = [w for w in resp.warnings if "cap raised" in w.lower()]
    assert cap_raised_warnings, (
        f"Expected at least one warning containing 'cap raised', "
        f"but got warnings: {resp.warnings}"
    )
