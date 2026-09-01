"""
timetable-solver/tests/test_double_lesson_adjacency.py

Property 4: Double-lesson adjacency.
Validates: Requirements 1.4 (§2b valid_double_starts enforcement)

When a BREAK column sits between two LESSON columns (making their template
positions non-adjacent), the solver must NEVER place a double-lesson that
spans that break.

Template used: make_template(6, break_after=2)

    pos 0: LESSON  (lesson-idx 0)
    pos 1: LESSON  (lesson-idx 1)
    pos 2: LESSON  (lesson-idx 2)
    pos 3: BREAK
    pos 4: LESSON  (lesson-idx 3)
    pos 5: LESSON  (lesson-idx 4)
    pos 6: LESSON  (lesson-idx 5)

Adjacent LESSON pairs (template positions differ by 1):
    (pos 0, pos 1) → lesson-idx 0  ✓  valid double start
    (pos 1, pos 2) → lesson-idx 1  ✓  valid double start
    (pos 2, pos 4) → lesson-idx 2  ✗  positions differ by 2 (BREAK at pos 3)
    (pos 4, pos 5) → lesson-idx 3  ✓  valid double start
    (pos 5, pos 6) → lesson-idx 4  ✓  valid double start

valid_double_starts (0-based lesson indices) = {0, 1, 3, 4}
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import make_template from conftest so the template construction is shared.
sys.path.insert(0, os.path.dirname(__file__))
from conftest import make_template

from solver import (
    _solve,
    SolverRequest,
    Subject,
    SchoolClass,
    Teacher,
    SubjectRequirement,
    TeacherAssignment,
)

# ---------------------------------------------------------------------------
# Template-derived constants
# ---------------------------------------------------------------------------

# make_template(6, break_after=2):
#   lesson-idx 0 → pos 0   \
#   lesson-idx 1 → pos 1    | positions differ by 1 → valid double start
#   lesson-idx 2 → pos 2   /
#   BREAK       → pos 3
#   lesson-idx 3 → pos 4   \
#   lesson-idx 4 → pos 5    | positions differ by 1 → valid double start
#   lesson-idx 5 → pos 6   /
#
# Pair (lesson-idx 2, lesson-idx 3): positions 2 and 4 → differ by 2 → INVALID
VALID_DOUBLE_STARTS = {0, 1, 3, 4}   # 0-based lesson indices


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_double_lesson_never_spans_break():
    """
    Property 4: A double-lesson subject must never occupy two consecutive
    lesson-period indices that are separated by a BREAK in the full template.

    With make_template(6, break_after=2):
      - lesson-idx 2 is at template position 2
      - lesson-idx 3 is at template position 4
      - They are separated by a BREAK at template position 3
      - Therefore a double starting at lesson-idx 2 is INVALID

    For every placed double-lesson slot reported at 1-based period p, the
    0-based lesson index (p-1) must be in VALID_DOUBLE_STARTS.
    """
    template = make_template(6, break_after=2)

    req = SolverRequest(
        subjects=[
            Subject(id="s1", code="SCIENCE", internalCode=1, doubleLesson=True),
        ],
        classes=[
            SchoolClass(id="c1", name="1A", form=1, streamIndex=0),
        ],
        teachers=[
            Teacher(id="t1", name="Alice"),
        ],
        requirements=[
            SubjectRequirement(classId="c1", subjectId="s1", lessonsPerWeek=2),
        ],
        teacherAssignments=[
            TeacherAssignment(classId="c1", subjectId="s1", teacherId="t1"),
        ],
        templateColumns=template,
        operatingDays=[1, 2, 3, 4, 5],
        timeLimitSeconds=10.0,
    )

    resp = _solve(req)

    # Sanity-check: at least one double-lesson slot must have been placed
    # (otherwise the test proves nothing about adjacency).
    double_slots = [s for s in resp.slots if s.subjectId == "s1"]
    assert len(double_slots) >= 1, (
        f"Expected at least 1 placed double-lesson slot, got {len(double_slots)}. "
        f"Solver status: {resp.status!r}  warnings: {resp.warnings}"
    )

    # For each placed slot the solver records the 1-based period of the
    # *start* of the double-block.  Convert to 0-based lesson-index (p-1)
    # and assert it is in VALID_DOUBLE_STARTS.
    for slot in double_slots:
        p = slot.period          # 1-based period (start of double)
        lesson_idx = p - 1       # 0-based lesson index
        assert lesson_idx in VALID_DOUBLE_STARTS, (
            f"Double-lesson placed at period {p} (lesson-idx {lesson_idx}) "
            f"which is NOT in valid_double_starts={VALID_DOUBLE_STARTS}. "
            f"This means the double spans a BREAK column in the template. "
            f"Full slot: {slot}"
        )


def test_double_lesson_adjacency_sanity_check_all_starts_in_valid_set():
    """
    Cross-check that VALID_DOUBLE_STARTS matches what the solver itself
    computes via §2b.  We verify this by inspecting the template columns
    that make_template(6, break_after=2) produces and re-deriving the set.
    """
    template = make_template(6, break_after=2)

    all_cols_sorted = sorted(template, key=lambda c: c.position)
    lesson_positions = [c.position for c in all_cols_sorted if c.slotType == "LESSON"]

    derived_valid = set()
    for i in range(len(lesson_positions) - 1):
        if lesson_positions[i + 1] == lesson_positions[i] + 1:
            derived_valid.add(i)

    assert derived_valid == VALID_DOUBLE_STARTS, (
        f"Derived valid_double_starts {derived_valid} does not match "
        f"expected {VALID_DOUBLE_STARTS}. Check the template definition."
    )
