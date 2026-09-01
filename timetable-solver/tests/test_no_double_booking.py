"""
timetable-solver/tests/test_no_double_booking.py

Property tests: no teacher double-booking and no class double-booking.

Validates: Requirements 1.2 (Property 1 and Property 2)

Generates N=20 random small-school SolverRequest fixtures (seeded with
random.seed(i) for reproducibility) and asserts:

  1. No two output slots share the same (teacherId, dayOfWeek, period).
  2. No two output slots share the same (classId, dayOfWeek, period).

Since these fixtures have NO LinkedClassGroups, the pooled-session exemption
does not apply, and uniqueness must be strict for both invariants.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import random

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


def make_template(n_lessons: int = 8) -> list:
    """
    Inline copy of conftest.make_template for direct import compatibility.
    Builds a list of LESSON TemplateColumns, mirroring the conftest helper.
    """
    return [
        TemplateColumn(
            position=i,
            startTime="08:00",
            endTime="08:45",
            slotType="LESSON",
            session="MORNING",
            label=None,
        )
        for i in range(n_lessons)
    ]


# ── Constants ─────────────────────────────────────────────────────────────────

N = 20                        # number of random fixtures to generate
NUM_DAYS = 5
NUM_PERIODS = 8               # use make_template(8) — 8 lesson slots/day
MAX_SLOTS_PER_TEACHER = NUM_DAYS * NUM_PERIODS   # 40 physical slots per teacher


# ── Random school fixture builder ─────────────────────────────────────────────

def build_random_school(seed: int) -> SolverRequest:
    """
    Build a small random school constrained so that total teacher load ≤ 40
    (5 days × 8 periods), ensuring the solver can place every lesson without
    needing to emit cap-raised warnings.

    Parameters
    ----------
    seed : int
        Passed to random.seed() for reproducibility.  Each iteration i uses
        random.seed(i) so the suite is deterministic.

    School shape
    ------------
    - 2–4 classes (all single-stream, no linked groups)
    - 2–4 subjects (all single-lesson / not doubleLesson)
    - 2–4 teachers
    - Each class × subject pair gets 1–3 lessons/week, capped so the assigned
      teacher's total load never exceeds NUM_DAYS × NUM_PERIODS.
    """
    random.seed(seed)

    num_classes = random.randint(2, 4)
    num_subjects = random.randint(2, 4)
    num_teachers = random.randint(2, 4)

    subjects = [
        Subject(id=f"s{i}", code=f"SUB{i}", internalCode=i, doubleLesson=False)
        for i in range(num_subjects)
    ]
    classes = [
        SchoolClass(id=f"c{i}", name=f"Class{i}", form=1, streamIndex=i)
        for i in range(num_classes)
    ]
    teachers = [
        Teacher(id=f"t{i}", name=f"Teacher{i}")
        for i in range(num_teachers)
    ]

    requirements: list[SubjectRequirement] = []
    assignments: list[TeacherAssignment] = []

    # Track cumulative load per teacher so we never exceed 40 physical slots.
    teacher_load: dict[str, int] = {t.id: 0 for t in teachers}

    for cls in classes:
        for subj in subjects:
            # Assign a random teacher from the pool.
            teacher = random.choice(teachers)
            tid = teacher.id

            # Cap lessons so teacher load stays within MAX_SLOTS_PER_TEACHER.
            remaining_capacity = MAX_SLOTS_PER_TEACHER - teacher_load[tid]
            if remaining_capacity <= 0:
                # Teacher is full — skip this class×subject pair entirely.
                continue

            lessons = random.randint(1, 3)
            lessons = min(lessons, remaining_capacity)

            requirements.append(
                SubjectRequirement(
                    classId=cls.id,
                    subjectId=subj.id,
                    lessonsPerWeek=lessons,
                )
            )
            assignments.append(
                TeacherAssignment(
                    classId=cls.id,
                    subjectId=subj.id,
                    teacherId=tid,
                )
            )
            teacher_load[tid] += lessons

    # Guard: if no requirements were generated (degenerate seed), produce at
    # least one so the solver has something to place.
    if not requirements:
        tid = teachers[0].id
        requirements.append(
            SubjectRequirement(classId=classes[0].id, subjectId=subjects[0].id, lessonsPerWeek=1)
        )
        assignments.append(
            TeacherAssignment(classId=classes[0].id, subjectId=subjects[0].id, teacherId=tid)
        )

    return SolverRequest(
        subjects=subjects,
        classes=classes,
        teachers=teachers,
        requirements=requirements,
        teacherAssignments=assignments,
        templateColumns=make_template(NUM_PERIODS),
        operatingDays=list(range(1, NUM_DAYS + 1)),
        timeLimitSeconds=5.0,
        linkedClassGroups=[],
    )


# ── Property test: random schools ─────────────────────────────────────────────

def test_no_double_booking_random():
    """
    Property 1 & 2 combined: for N=20 random seeded schools with no
    LinkedClassGroups:
      - no (teacherId, dayOfWeek, period) triple appears more than once, and
      - no (classId, dayOfWeek, period) triple appears more than once.

    Validates: Requirements 1.2
    """
    failures: list[str] = []

    for i in range(N):
        req = build_random_school(i)
        resp = _solve(req)
        slots = resp.slots

        # ── Assert 1: No teacher double-booking ───────────────────────────
        teacher_seen: set[tuple[str, int, int]] = set()
        for s in slots:
            key = (s.teacherId, s.dayOfWeek, s.period)
            if key in teacher_seen:
                failures.append(
                    f"[seed={i}] Teacher double-booking: teacherId={s.teacherId} "
                    f"dayOfWeek={s.dayOfWeek} period={s.period}"
                )
                break
            teacher_seen.add(key)

        # ── Assert 2: No class double-booking ─────────────────────────────
        class_seen: set[tuple[str, int, int]] = set()
        for s in slots:
            key = (s.classId, s.dayOfWeek, s.period)
            if key in class_seen:
                failures.append(
                    f"[seed={i}] Class double-booking: classId={s.classId} "
                    f"dayOfWeek={s.dayOfWeek} period={s.period}"
                )
                break
            class_seen.add(key)

    assert not failures, (
        f"{len(failures)} double-booking violation(s) across {N} random schools:\n"
        + "\n".join(failures)
    )


# ── Fixed-fixture test: minimal_school ────────────────────────────────────────

def test_no_double_booking_fixed(minimal_school):
    """
    Non-parametric sanity check using the shared minimal_school fixture from
    conftest.py.  Confirms that the fixture itself is correctly constructed
    and that _solve() honours both hard booking constraints on it.

    Validates: Requirements 1.2
    """
    resp = _solve(minimal_school)
    slots = resp.slots

    # Assert 1: No teacher double-booking
    teacher_tuples = [(s.teacherId, s.dayOfWeek, s.period) for s in slots]
    assert len(teacher_tuples) == len(set(teacher_tuples)), (
        "Teacher double-booking detected in minimal_school fixture. "
        f"Duplicates: {[t for t in teacher_tuples if teacher_tuples.count(t) > 1]}"
    )

    # Assert 2: No class double-booking
    class_tuples = [(s.classId, s.dayOfWeek, s.period) for s in slots]
    assert len(class_tuples) == len(set(class_tuples)), (
        "Class double-booking detected in minimal_school fixture. "
        f"Duplicates: {[t for t in class_tuples if class_tuples.count(t) > 1]}"
    )
