"""
timetable-solver/tests/test_consecutive_limits.py

Property 5: Consecutive lesson limit.

Feature: cp-sat-engine-upgrade
Validates: Requirements 1.6, 1.7 (maxConsecutiveLessons, preventUnintendedDoubles)

When maxConsecutiveLessons=2, no class should have 3 or more consecutive
occupied physical periods on any single day.

When preventUnintendedDoubles=True, no single-lesson subject should occupy
two consecutive periods for the same class on the same day.
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


def test_max_consecutive_lessons():
    """
    Validates: Requirements 1.6

    1 class (c1), 3 subjects (MATH, ENG, SCI), 1 teacher (t1).
    All subjects: doubleLesson=False, 3 lessons/week each = 9 total.
    Teacher has capacity for runs of 3 if unconstrained.
    maxConsecutiveLessons=2.

    For each (classId, dayOfWeek), no run of 3+ consecutive periods
    should appear in the output.
    """
    req = SolverRequest(
        subjects=[
            Subject(id="s1", code="MATH", internalCode=1, doubleLesson=False),
            Subject(id="s2", code="ENG",  internalCode=2, doubleLesson=False),
            Subject(id="s3", code="SCI",  internalCode=3, doubleLesson=False),
        ],
        classes=[
            SchoolClass(id="c1", name="1A", form=1, streamIndex=0),
        ],
        teachers=[
            Teacher(id="t1", name="Alice"),
        ],
        requirements=[
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=3),
            SubjectRequirement(classId="c1", subjectId="s2", lessonsPerWeek=3),
            SubjectRequirement(classId="c1", subjectId="s3", lessonsPerWeek=3),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
            TeacherAssignment(classId="c1", subjectId="s2", teacherId="t1"),
            TeacherAssignment(classId="c1", subjectId="s3", teacherId="t1"),
        ],
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
        maxConsecutiveLessons=2,
    )

    resp = _solve(req)

    # Group all placed periods by (classId, dayOfWeek)
    by_class_day: dict = {}
    for s in resp.slots:
        key = (s.classId, s.dayOfWeek)
        by_class_day.setdefault(key, set()).add(s.period)

    violations = []
    for (cid, day), periods in by_class_day.items():
        sorted_periods = sorted(periods)
        # Detect any run of 3+ consecutive integers
        for i in range(len(sorted_periods) - 2):
            p1 = sorted_periods[i]
            p2 = sorted_periods[i + 1]
            p3 = sorted_periods[i + 2]
            if p2 == p1 + 1 and p3 == p2 + 1:
                violations.append(
                    f"Class {cid} on day {day}: consecutive run at periods "
                    f"{p1},{p2},{p3}"
                )

    assert not violations, (
        "maxConsecutiveLessons=2 violated:\n" + "\n".join(violations)
    )


def test_prevent_unintended_doubles():
    """
    Validates: Requirements 1.7

    1 class (c1), 1 subject MATH (doubleLesson=False), 1 teacher t1.
    5 lessons/week, preventUnintendedDoubles=True.

    For each (classId, dayOfWeek), no two consecutive periods should be
    placed for MATH (i.e. sorted periods must have no p[i+1] == p[i] + 1).
    """
    req = SolverRequest(
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
        templateColumns=make_template(8),
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
        preventUnintendedDoubles=True,
    )

    resp = _solve(req)

    # For each (classId, dayOfWeek), collect periods where MATH is placed
    by_class_day: dict = {}
    for s in resp.slots:
        key = (s.classId, s.dayOfWeek)
        by_class_day.setdefault(key, []).append(s.period)

    violations = []
    for (cid, day), periods in by_class_day.items():
        sorted_periods = sorted(periods)
        for i in range(len(sorted_periods) - 1):
            if sorted_periods[i + 1] == sorted_periods[i] + 1:
                violations.append(
                    f"Class {cid} on day {day}: MATH placed at consecutive "
                    f"periods {sorted_periods[i]} and {sorted_periods[i+1]}"
                )

    assert not violations, (
        "preventUnintendedDoubles=True violated for MATH:\n"
        + "\n".join(violations)
    )
