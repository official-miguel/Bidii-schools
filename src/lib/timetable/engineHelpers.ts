/**
 * src/lib/timetable/engineHelpers.ts
 *
 * Helper utilities for the deterministic timetable engine
 */

import { TimetableSlotType } from "@prisma/client";
import type { TemplateColumn } from "./deterministicEngine";

/**
 * Extract only lesson columns from template (filters out breaks, lunch, etc.)
 */
export function getLessonColumns(columns: TemplateColumn[]): TemplateColumn[] {
  return columns
    .filter((col) => col.slotType === TimetableSlotType.LESSON)
    .sort((a, b) => a.position - b.position);
}

/**
 * Map period number (1-based) to actual template position
 */
export function periodToTemplatePosition(
  period: number,
  columns: TemplateColumn[]
): number | null {
  const lessonCols = getLessonColumns(columns);
  return lessonCols[period - 1]?.position ?? null;
}

/**
 * Map template position to period number (1-based among lesson slots only)
 */
export function templatePositionToPeriod(
  position: number,
  columns: TemplateColumn[]
): number | null {
  const lessonCols = getLessonColumns(columns);
  const index = lessonCols.findIndex((col) => col.position === position);
  return index >= 0 ? index + 1 : null;
}

/**
 * Get total number of teaching periods per day (excludes breaks/lunch/etc.)
 */
export function getTotalTeachingPeriods(columns: TemplateColumn[]): number {
  return columns.filter((col) => col.slotType === TimetableSlotType.LESSON).length;
}

/**
 * Check if two periods are consecutive (no break/lunch between them)
 */
export function arePeriodsConsecutive(
  period1: number,
  period2: number,
  columns: TemplateColumn[]
): boolean {
  const lessonCols = getLessonColumns(columns);
  const idx1 = period1 - 1;
  const idx2 = period2 - 1;

  if (idx1 < 0 || idx2 < 0 || idx1 >= lessonCols.length || idx2 >= lessonCols.length) {
    return false;
  }

  // Check if positions are adjacent in the full template
  const pos1 = lessonCols[idx1].position;
  const pos2 = lessonCols[idx2].position;

  return Math.abs(pos2 - pos1) === 1;
}

/**
 * Get time range for a period
 */
export function getPeriodTimeRange(
  period: number,
  columns: TemplateColumn[]
): { startTime: string; endTime: string } | null {
  const lessonCols = getLessonColumns(columns);
  const column = lessonCols[period - 1];
  return column ? { startTime: column.startTime, endTime: column.endTime } : null;
}

/**
 * Calculate total required slots for a week
 */
export function calculateWeeklySlotRequirement(
  operatingDays: number[],
  columns: TemplateColumn[]
): number {
  const periodsPerDay = getTotalTeachingPeriods(columns);
  return operatingDays.length * periodsPerDay;
}

/**
 * Group slots by class
 */
export function groupSlotsByClass<T extends { classId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.classId)) {
      grouped.set(slot.classId, []);
    }
    grouped.get(slot.classId)!.push(slot);
  }
  return grouped;
}

/**
 * Group slots by teacher
 */
export function groupSlotsByTeacher<T extends { teacherId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.teacherId)) {
      grouped.set(slot.teacherId, []);
    }
    grouped.get(slot.teacherId)!.push(slot);
  }
  return grouped;
}

/**
 * Group slots by subject
 */
export function groupSlotsBySubject<T extends { subjectId: string }>(
  slots: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const slot of slots) {
    if (!grouped.has(slot.subjectId)) {
      grouped.set(slot.subjectId, []);
    }
    grouped.get(slot.subjectId)!.push(slot);
  }
  return grouped;
}

/**
 * Find overlapping slots (same day and period)
 */
export function findOverlappingSlots<T extends { dayOfWeek: number; period: number }>(
  slots: T[]
): T[][] {
  const slotMap = new Map<string, T[]>();

  for (const slot of slots) {
    const key = `${slot.dayOfWeek}-${slot.period}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, []);
    }
    slotMap.get(key)!.push(slot);
  }

  return Array.from(slotMap.values()).filter((group) => group.length > 1);
}

/**
 * Calculate teacher workload distribution
 */
export function calculateTeacherWorkload<T extends { teacherId: string; dayOfWeek: number }>(
  slots: T[]
): Map<string, { totalLessons: number; lessonsPerDay: Map<number, number> }> {
  const workload = new Map<
    string,
    { totalLessons: number; lessonsPerDay: Map<number, number> }
  >();

  for (const slot of slots) {
    if (!workload.has(slot.teacherId)) {
      workload.set(slot.teacherId, {
        totalLessons: 0,
        lessonsPerDay: new Map(),
      });
    }

    const teacherData = workload.get(slot.teacherId)!;
    teacherData.totalLessons++;

    const dayCount = teacherData.lessonsPerDay.get(slot.dayOfWeek) ?? 0;
    teacherData.lessonsPerDay.set(slot.dayOfWeek, dayCount + 1);
  }

  return workload;
}

/**
 * Check if a class has lessons in all teaching periods
 */
export function hasFullCoverage<T extends { dayOfWeek: number; period: number }>(
  slots: T[],
  operatingDays: number[],
  columns: TemplateColumn[]
): boolean {
  const totalSlots = calculateWeeklySlotRequirement(operatingDays, columns);
  return slots.length >= totalSlots;
}

/**
 * Get empty slots for a class
 */
export function getEmptySlots(
  existingSlots: Array<{ dayOfWeek: number; period: number }>,
  operatingDays: number[],
  columns: TemplateColumn[]
): Array<{ dayOfWeek: number; period: number }> {
  const occupied = new Set(
    existingSlots.map((s) => `${s.dayOfWeek}-${s.period}`)
  );

  const totalPeriods = getTotalTeachingPeriods(columns);
  const emptySlots: Array<{ dayOfWeek: number; period: number }> = [];

  for (const day of operatingDays) {
    for (let period = 1; period <= totalPeriods; period++) {
      const key = `${day}-${period}`;
      if (!occupied.has(key)) {
        emptySlots.push({ dayOfWeek: day, period });
      }
    }
  }

  return emptySlots;
}

/**
 * Calculate subject distribution across days
 */
export function getSubjectDayDistribution<
  T extends { subjectId: string; dayOfWeek: number }
>(slots: T[]): Map<string, Set<number>> {
  const distribution = new Map<string, Set<number>>();

  for (const slot of slots) {
    if (!distribution.has(slot.subjectId)) {
      distribution.set(slot.subjectId, new Set());
    }
    distribution.get(slot.subjectId)!.add(slot.dayOfWeek);
  }

  return distribution;
}

/**
 * Get day name from day number
 */
export function getDayName(dayOfWeek: number): string {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[dayOfWeek] ?? "Unknown";
}

/**
 * Format time range
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`;
}

/**
 * Calculate completion percentage
 */
export function calculateCompletionPercentage(
  scheduled: number,
  required: number
): number {
  if (required === 0) return 100;
  return Math.round((scheduled / required) * 100 * 100) / 100;
}

// ─── Elective group synchronisation ──────────────────────────────────────────

/**
 * Shape of a raw ElectiveGroup row returned by Prisma (only the fields we
 * need — keeps this helper independent of the full Prisma client type).
 */
export type RawElectiveGroup = {
  id: string;
  name?: string;              // display name, used in error messages
  scopeForm: number;          // 0 = school-wide, N = form N
  scopeStreams: string[];      // [] = all streams in the form
  /** How many of the weekly lessons should be scheduled as consecutive double blocks */
  doublesPerWeek?: number;
  members: Array<{ subjectId: string }>;
};

/**
 * Shape of a raw class row (subset of SchoolClass).
 */
export type RawClass = {
  id: string;
  form: number;
  stream: string | null;
};

/**
 * buildLinkedClassGroups
 *
 * Converts raw ElectiveGroup records from the database into the
 * `LinkedClassGroup[]` format expected by the CP-SAT solver.
 *
 * Rules:
 *  - scopeForm === 0  → group applies to ALL classes regardless of form.
 *  - scopeForm > 0    → group applies only to classes in that form.
 *  - scopeStreams = [] → all streams in the scoped form.
 *  - scopeStreams = ['North', 'East'] → only those named streams.
 *
 * Groups with fewer than 2 matching classes are silently dropped (nothing
 * to synchronise).
 */
export function buildLinkedClassGroups(
  electiveGroups: RawElectiveGroup[],
  classes: RawClass[]
): Array<{ subjectIds: string[]; classIds: string[] }> {
  // ── Defensive assertion: anchor subjects must be unique across groups ──────
  //
  // The anchor subject (first member) of a group drives the solver's
  // synchronisation constraint — all sibling classes must have that subject at
  // the same (day, period).  If two groups in an overlapping scope share the
  // same anchor the solver receives contradictory equality constraints and
  // places 0 lessons for every subject involved.
  //
  // The members API enforces this at write time.  This assertion is a
  // belt-and-suspenders guard that makes misconfigured data fail loudly here —
  // during generation — rather than silently producing an empty timetable.
  //
  // "Same scope" = same scopeForm AND streams overlap (either side is
  // all-streams, or the two stream sets share at least one name).
  const anchorConflicts: string[] = [];

  for (let i = 0; i < electiveGroups.length; i++) {
    const a = electiveGroups[i];
    const anchorA = a.members[0]?.subjectId;
    if (!anchorA) continue;

    for (let j = i + 1; j < electiveGroups.length; j++) {
      const b = electiveGroups[j];
      const anchorB = b.members[0]?.subjectId;
      if (!anchorB) continue;
      if (anchorA !== anchorB) continue;

      // Same anchor — check scope overlap
      if (a.scopeForm !== b.scopeForm) continue;  // different forms, no conflict

      const aAllStreams = a.scopeStreams.length === 0;
      const bAllStreams = b.scopeStreams.length === 0;
      const overlap =
        aAllStreams ||
        bAllStreams ||
        a.scopeStreams.some((s) => b.scopeStreams.includes(s));

      if (overlap) {
        anchorConflicts.push(
          `Subject "${anchorA}" is the anchor of both group "${a.name ?? a.id}" and group ` +
          `"${b.name ?? b.id}" within the same scope (${a.scopeForm === 0 ? "school-wide" : `Form ${a.scopeForm}`}). ` +
          `This creates contradictory solver constraints. Remove the subject from one ` +
          `group's anchor position before generating.`,
        );
      }
    }
  }

  if (anchorConflicts.length > 0) {
    throw new Error(
      `Elective group anchor conflict detected — generation aborted.\n` +
      anchorConflicts.map((c, i) => `  ${i + 1}. ${c}`).join("\n"),
    );
  }

  // ── Build one linked-group entry per elective group ───────────────────────
  const result: Array<{ subjectIds: string[]; classIds: string[] }> = [];

  for (const group of electiveGroups) {
    const subjectIds = group.members.map((m) => m.subjectId);
    if (subjectIds.length === 0) continue;

    // Determine which classes are in scope for this group
    const inScope = classes.filter((cls) => {
      // Form check (scopeForm === 0 means school-wide — all classes qualify)
      if (group.scopeForm !== 0 && cls.form !== group.scopeForm) return false;

      // Stream check — only applied when the group is form-scoped AND
      // restricted to specific streams
      if (
        group.scopeForm !== 0 &&
        group.scopeStreams.length > 0 &&
        !group.scopeStreams.includes(cls.stream ?? "")
      ) {
        return false;
      }

      return true;
    });

    if (inScope.length < 2) continue; // single class — nothing to synchronise

    result.push({
      subjectIds,
      classIds: inScope.map((c) => c.id),
    });
  }

  return result;
}

// ─── Group-aware solver payload helpers ──────────────────────────────────────

/**
 * A raw ClassElectiveGroupTeacher row — only the fields we need.
 */
export type RawGroupTeacher = {
  groupId:   string;
  classId:   string;
  subjectId: string;
  teacherId: string;
};

/**
 * A raw SubjectLessonRequirement row as loaded by the generate routes.
 */
export type RawRequirement = {
  subjectId:      string;
  classId:        string;
  lessonsPerWeek: number;
};

/**
 * A raw TeacherAssignment row (from ClassSubjectTeacher).
 */
export type RawTeacherAssignment = {
  classId:   string;
  subjectId: string;
  teacherId: string;
};

/**
 * Describes a single elective group for the purposes of payload-building.
 * Carries just what the helper needs.
 */
export type GroupPayloadDescriptor = {
  groupId:        string;
  name:           string;
  /** Subject IDs that belong to this group, in the order they should be sent */
  subjectIds:     string[];
  /** lessonsPerWeek from ElectiveGroup — shared by all subjects in the group */
  lessonsPerWeek: number;
  /**
   * How many of those weekly lessons should be scheduled as consecutive
   * double-lesson blocks.  0 = all singles (default, backward-compatible).
   * When > 0 the anchor subject sent to the solver will have doubleLesson=true
   * so the CP-SAT engine places consecutive pairs.
   */
  doublesPerWeek: number;
  /** Classes that are in scope for this group */
  classIds:       string[];
};

/**
 * Return type of buildGroupAwarePayload.
 */
export type GroupAwarePayload = {
  /**
   * Modified requirements list: group subjects are collapsed so only the
   * ANCHOR subject (first in subjectIds) has a requirement row; the rest
   * are dropped so the solver schedules exactly one slot per period.
   */
  requirements: RawRequirement[];
  /**
   * Augmented teacher assignments: ClassSubjectTeacher rows PLUS one
   * synthetic row per (classId, anchorSubjectId) pointing to the first
   * teacher found in ClassElectiveGroupTeacher for that group+class.
   */
  teacherAssignments: RawTeacherAssignment[];
  /**
   * Fan-out map keyed by COMPOSITE anchor key "classId:groupId:anchorSubjectId".
   * Value is the list of (subjectId, teacherId) pairs to emit per solved slot.
   * Use anchorRealKeyToCompositeKeys to look up composite keys from solver output.
   */
  fanOutMap: Map<string, Array<{ subjectId: string; teacherId: string }>>;
  /**
   * Reverse lookup: "classId:anchorSubjectId" (solver's real key) →
   * list of composite keys "classId:groupId:anchorSubjectId".
   * There may be multiple composite keys when the same subject is the anchor
   * in more than one group for the same class.
   */
  anchorRealKeyToCompositeKeys: Map<string, string[]>;
  /**
   * Set of anchor subjectIds that belong to a group with doublesPerWeek > 0.
   */
  doubleAnchorSubjectIds: Set<string>;
};

/**
 * buildGroupAwarePayload
 *
 * Transforms raw requirements and teacher assignments so the CP-SAT solver
 * treats each elective group as a single atomic slot instead of N independent
 * lessons.
 *
 * Composite key design
 * --------------------
 * A subject (e.g. GEO) can legitimately belong to more than one elective group
 * (e.g. GPC and GHC).  Using a plain "classId:subjectId" key for groupOwnership
 * or fanOutMap would cause the second group's entry to overwrite the first.
 *
 * We therefore use THREE-PART keys internally:
 *   groupOwnership  →  "classId:groupId:subjectId"
 *   fanOutMap       →  "classId:groupId:anchorSubjectId"
 *
 * These composite keys are NEVER written to the database.  The solver and all
 * DB inserts continue to use real subjectIds.  fanOutGroupSlots receives a
 * reverse-lookup (anchorRealKeyToComposite) to map the solver's plain
 * "classId:anchorSubjectId" back to the correct composite fanOut key.
 */
export function buildGroupAwarePayload(
  requirements:       RawRequirement[],
  teacherAssignments: RawTeacherAssignment[],
  groups:             GroupPayloadDescriptor[],
  groupTeachers:      RawGroupTeacher[],
): GroupAwarePayload {
  // Build a lookup: "groupId:classId:subjectId" → teacherId[]
  const gtLookup = new Map<string, string[]>();
  for (const gt of groupTeachers) {
    const key = `${gt.groupId}:${gt.classId}:${gt.subjectId}`;
    const list = gtLookup.get(key) ?? [];
    list.push(gt.teacherId);
    gtLookup.set(key, list);
  }

  // ── Ownership map (composite key: "classId:groupId:subjectId") ───────────
  // Tracks which (class, group, subject) triples belong to a group and whether
  // the subject is that group's anchor.  Using the groupId in the key prevents
  // a subject that appears in multiple groups from having its second-group entry
  // silently overwritten.
  const groupOwnership = new Map<string, { groupId: string; isAnchor: boolean }>();

  // Fan-out map: "classId:groupId:anchorSubjectId" → [{ subjectId, teacherId }]
  const fanOutMap = new Map<string, Array<{ subjectId: string; teacherId: string }>>();

  // Reverse lookup used by fanOutGroupSlots:
  // "classId:anchorSubjectId" → "classId:groupId:anchorSubjectId"
  // There can be multiple entries if the same subject is the anchor in different
  // groups for the same class — both are recorded.
  const anchorRealKeyToCompositeKeys = new Map<string, string[]>();

  // Synthetic teacher assignments for anchors
  const syntheticAssignments: RawTeacherAssignment[] = [];

  // Anchor subject IDs whose group has doublesPerWeek > 0
  const doubleAnchorSubjectIds = new Set<string>();

  for (const group of groups) {
    if (group.subjectIds.length === 0) continue;
    const anchorSubjectId = group.subjectIds[0];

    if ((group.doublesPerWeek ?? 0) > 0) {
      doubleAnchorSubjectIds.add(anchorSubjectId);
    }

    for (const classId of group.classIds) {
      // Register ownership for every subject in this group for this class
      for (let i = 0; i < group.subjectIds.length; i++) {
        const sid = group.subjectIds[i];
        // Composite key prevents cross-group collision
        groupOwnership.set(`${classId}:${group.groupId}:${sid}`, {
          groupId:  group.groupId,
          isAnchor: i === 0,
        });
      }

      // Fan-out list keyed by composite anchor key
      const compositeAnchorKey = `${classId}:${group.groupId}:${anchorSubjectId}`;
      const fanOutEntries: Array<{ subjectId: string; teacherId: string }> = [];

      for (const sid of group.subjectIds) {
        const gtKey    = `${group.groupId}:${classId}:${sid}`;
        const teachers = gtLookup.get(gtKey) ?? [];
        if (teachers.length === 0) {
          fanOutEntries.push({ subjectId: sid, teacherId: "" });
        } else {
          for (const tid of teachers) {
            fanOutEntries.push({ subjectId: sid, teacherId: tid });
          }
        }
      }

      fanOutMap.set(compositeAnchorKey, fanOutEntries);

      // Register the reverse lookup so fanOutGroupSlots can find this entry
      // from the solver's plain "classId:anchorSubjectId" key
      const realAnchorKey = `${classId}:${anchorSubjectId}`;
      const existing = anchorRealKeyToCompositeKeys.get(realAnchorKey) ?? [];
      existing.push(compositeAnchorKey);
      anchorRealKeyToCompositeKeys.set(realAnchorKey, existing);

      // Synthetic teacher assignment for the anchor
      const anchorGtKey    = `${group.groupId}:${classId}:${anchorSubjectId}`;
      const anchorTeachers = gtLookup.get(anchorGtKey) ?? [];
      if (anchorTeachers.length > 0) {
        syntheticAssignments.push({
          classId,
          subjectId: anchorSubjectId,
          teacherId: anchorTeachers[0],
        });
      }
    }
  }

  // ── Build requirements ────────────────────────────────────────────────
  //
  // With the hard rule enforced at the API layer, each (classId, subjectId)
  // pair can be the anchor of AT MOST ONE group in normal operation.
  //
  // If two groups somehow share an anchor and both reach this function, the
  // assertion in buildLinkedClassGroups will have already aborted generation
  // before we get here.  The defensive check below is a secondary guard:
  // it detects the same condition and throws clearly rather than producing
  // silently wrong output.
  //
  // Non-anchor group subjects are dropped from requirements entirely — they
  // are covered by the fan-out after the anchor is placed.
  // Non-group subjects pass through unchanged.
  //
  // Build plain "classId:subjectId" → list-of-ownership from composite keys.
  type OwnershipEntry = { groupId: string; isAnchor: boolean };
  const plainOwnership = new Map<string, OwnershipEntry[]>();
  for (const [compositeKey, entry] of groupOwnership) {
    const parts     = compositeKey.split(":");
    const classId   = parts[0];
    const subjectId = parts[2];
    const plainKey  = `${classId}:${subjectId}`;
    const list      = plainOwnership.get(plainKey) ?? [];
    list.push(entry);
    plainOwnership.set(plainKey, list);
  }

  // Secondary assertion: verify no subject is an anchor for more than one group
  for (const [plainKey, entries] of plainOwnership) {
    const anchorEntries = entries.filter((e) => e.isAnchor);
    if (anchorEntries.length > 1) {
      const anchorGroupIds = anchorEntries.map((e) => e.groupId).join(", ");
      throw new Error(
        `[buildGroupAwarePayload] Anchor conflict on "${plainKey}": ` +
        `subject is the anchor for ${anchorEntries.length} groups (${anchorGroupIds}). ` +
        `This should have been caught by buildLinkedClassGroups. ` +
        `Fix the elective group data — each subject may only be the anchor for one elective group.`,
      );
    }
  }

  const groupLpwMap = new Map<string, number>();
  for (const g of groups) groupLpwMap.set(g.groupId, g.lessonsPerWeek);

  const filteredRequirements: RawRequirement[] = [];
  for (const req of requirements) {
    const plainKey   = `${req.classId}:${req.subjectId}`;
    const ownerships = plainOwnership.get(plainKey);

    if (!ownerships) {
      // Not owned by any group — pass through unchanged
      filteredRequirements.push(req);
      continue;
    }

    const anchorGroups = ownerships.filter((o) => o.isAnchor);
    // Non-anchor subjects are intentionally dropped here.  They are never
    // independent solver requirements — they are re-emitted by fanOutGroupSlots
    // under their group anchor's time slot.  A subject may appear as non-anchor
    // in multiple groups (different baskets, different anchors) without
    // conflict: each group schedules it under its own anchor's slot, so
    // different students in different baskets simply attend at different times.
    // Only the anchor position is restricted to be unique across groups.
    if (anchorGroups.length === 0) continue;

    // Exactly one anchor group per the assertion above
    const lpw = groupLpwMap.get(anchorGroups[0].groupId) ?? req.lessonsPerWeek;
    filteredRequirements.push({ ...req, lessonsPerWeek: lpw });
  }

  // ── Filter teacher assignments ─────────────────────────────────────────
  const filteredAssignments = teacherAssignments.filter((a) => {
    return !plainOwnership.has(`${a.classId}:${a.subjectId}`);
  });

  const assignmentKeys = new Set(filteredAssignments.map((a) => `${a.classId}:${a.subjectId}`));
  for (const sa of syntheticAssignments) {
    const key = `${sa.classId}:${sa.subjectId}`;
    if (!assignmentKeys.has(key)) {
      filteredAssignments.push(sa);
      assignmentKeys.add(key);
    }
  }

  return {
    requirements:               filteredRequirements,
    teacherAssignments:         filteredAssignments,
    fanOutMap,
    doubleAnchorSubjectIds,
    anchorRealKeyToCompositeKeys,
  };
}

/**
 * A minimal shape of a form-wide ElectiveGroupTeacher row (only the fields
 * we need in this helper — keeps it independent of the full Prisma type).
 */
export type RawFormGroupTeacher = {
  groupId:   string;
  subjectId: string;
  teacherId: string;
};

/**
 * mergeGroupTeachers
 *
 * Bridges the gap between the two teacher-assignment tables:
 *
 *  • ElectiveGroupTeacher   (form-wide) — saved via Timetable → Requirements.
 *  • ClassElectiveGroupTeacher (per-class) — saved via each class's profile page.
 *
 * The timetable engine only reads ClassElectiveGroupTeacher rows.  If a school
 * has only assigned teachers form-wide (via the Requirements page) and has
 * never opened the class-profile teacher UI, classRows will be empty and the
 * engine will think no teachers are assigned — causing false BLOCKING errors
 * and skipping group collapsing entirely.
 *
 * This function synthesises equivalent ClassElectiveGroupTeacher-style entries
 * from the form-wide rows so both assignment paths produce the same result.
 *
 * Algorithm
 * ---------
 * For every ElectiveGroupTeacher row (groupId, subjectId, teacherId):
 *   1. Find which classes are in scope for this group (using electiveGroupsRaw
 *      for scopeForm / scopeStreams, and classesRaw for form / stream).
 *   2. For each in-scope class that does NOT already have a matching
 *      ClassElectiveGroupTeacher row with the same (groupId, classId,
 *      subjectId, teacherId), add a synthesised entry.
 *
 * The returned array is a deduplicated merge of classRows + synthesised rows
 * and can be used wherever classElectiveTeachersRaw is expected.
 */
export function mergeGroupTeachers(
  formRows:          RawFormGroupTeacher[],
  classRows:         RawGroupTeacher[],
  electiveGroupsRaw: RawElectiveGroup[],
  classesRaw:        RawClass[],
): RawGroupTeacher[] {
  if (formRows.length === 0) return classRows;

  // Fast lookup: already-existing per-class rows
  const existingKeys = new Set(
    classRows.map((r) => `${r.groupId}:${r.classId}:${r.subjectId}:${r.teacherId}`)
  );

  // Build a quick map: groupId → group metadata (scopeForm, scopeStreams)
  const groupMeta = new Map(
    electiveGroupsRaw.map((g) => [g.id, { scopeForm: g.scopeForm, scopeStreams: g.scopeStreams }])
  );

  const synthesised: RawGroupTeacher[] = [];

  for (const fr of formRows) {
    const meta = groupMeta.get(fr.groupId);
    if (!meta) continue; // group not in scope for this school fetch

    // Find all classes that are in scope for this group
    for (const cls of classesRaw) {
      if (meta.scopeForm !== 0 && cls.form !== meta.scopeForm) continue;
      if (
        meta.scopeForm !== 0 &&
        meta.scopeStreams.length > 0 &&
        !meta.scopeStreams.includes(cls.stream ?? "")
      ) continue;

      const key = `${fr.groupId}:${cls.id}:${fr.subjectId}:${fr.teacherId}`;
      if (!existingKeys.has(key)) {
        synthesised.push({
          groupId:   fr.groupId,
          classId:   cls.id,
          subjectId: fr.subjectId,
          teacherId: fr.teacherId,
        });
        existingKeys.add(key); // prevent duplicates within the synthesised list
      }
    }
  }

  return synthesised.length === 0 ? classRows : [...classRows, ...synthesised];
}

/**
 * resolveGroupAnchors
 *
 * Ensures that no two active groups share the same anchor subject (first
 * element of subjectIds).  The anchor is the subject the solver uses as the
 * single representative requirement for the whole group — two groups with the
 * same anchor cause the solver to receive a combined requirement count (e.g.
 * GEO = 10 when both GPC and GHC need 5) and the fan-out map uses a reverse
 * lookup that maps the solver's real key back to composite keys.  While the
 * maths works, the linkedClassGroups co-scheduling constraint referencing the
 * same anchor subject for two groups creates structural ambiguity in the solver.
 *
 * This function reorders each group's subjectIds in-place (returning new
 * arrays) so every active group starts with a subject that no other active
 * group uses as its anchor.  Groups that share all subjects with another group
 * are left as-is (an edge case that cannot be resolved without changing group
 * membership — the operator will see a pre-check warning).
 *
 * Algorithm
 * ----------
 * 1. Collect all current anchors: groupId → anchorSubjectId.
 * 2. In one pass, for each group whose anchor is already claimed by a
 *    previously-seen group, rotate subjectIds until an unclaimed subject is
 *    found, or leave unchanged if none exists.
 * 3. Return the descriptors with updated subjectIds arrays (originals untouched).
 */
export function resolveGroupAnchors(
  groups: GroupPayloadDescriptor[],
): GroupPayloadDescriptor[] {
  // Only consider active groups (those with at least one assigned class)
  const claimedAnchors = new Set<string>(); // subjectId → taken

  return groups.map((group) => {
    if (group.subjectIds.length === 0 || group.classIds.length === 0) {
      return group; // inactive or empty — pass through
    }

    // Try each subject as the candidate anchor (starting from current order)
    const candidateIdx = group.subjectIds.findIndex(
      (sid) => !claimedAnchors.has(sid)
    );

    if (candidateIdx === -1) {
      // All subjects already claimed as anchors by earlier groups — cannot
      // resolve automatically.  Leave the current anchor; the pre-check will
      // surface an INFO message.
      claimedAnchors.add(group.subjectIds[0]);
      return group;
    }

    // Rotate: put the candidate at index 0, preserve relative order of the rest
    const newSubjectIds =
      candidateIdx === 0
        ? group.subjectIds // already fine
        : [
            group.subjectIds[candidateIdx],
            ...group.subjectIds.slice(0, candidateIdx),
            ...group.subjectIds.slice(candidateIdx + 1),
          ];

    claimedAnchors.add(newSubjectIds[0]);

    return candidateIdx === 0
      ? group
      : { ...group, subjectIds: newSubjectIds };
  });
}

/**
 * fanOutGroupSlots
 *
 * Takes the solver output (one anchor slot per class per group) and expands
 * it back into the full set of slots — one per subject per teacher in the group.
 * Non-group slots are passed through unchanged.
 *
 * The solver only knows real subjectIds.  The fanOutMap is keyed by the
 * COMPOSITE key "classId:groupId:anchorSubjectId".  We resolve the solver's
 * plain "classId:anchorSubjectId" back to composite keys via the reverse-lookup
 * map anchorRealKeyToCompositeKeys returned by buildGroupAwarePayload.
 *
 * When the same subject is the anchor in two different groups for the same
 * class, anchorRealKeyToCompositeKeys will have TWO composite keys for that
 * plain key — and we fan out both groups independently.
 */
export function fanOutGroupSlots(
  solverSlots: Array<{
    classId:   string;
    dayOfWeek: number;
    period:    number;
    subjectId: string;
    teacherId: string;
    room:      string | null;
  }>,
  fanOutMap:                    Map<string, Array<{ subjectId: string; teacherId: string }>>,
  anchorRealKeyToCompositeKeys: Map<string, string[]>,
): typeof solverSlots {
  const result: typeof solverSlots = [];

  for (const slot of solverSlots) {
    const realKey       = `${slot.classId}:${slot.subjectId}`;
    const compositeKeys = anchorRealKeyToCompositeKeys.get(realKey);

    if (!compositeKeys || compositeKeys.length === 0) {
      // Not a group anchor — emit as-is
      result.push(slot);
      continue;
    }

    // Expand each group this subject anchors
    for (const compositeKey of compositeKeys) {
      const entries = fanOutMap.get(compositeKey) ?? [];
      for (const entry of entries) {
        if (!entry.teacherId) {
          // A group subject has no teacher assigned.  Log a warning so the
          // admin can diagnose the data gap via server logs, but still emit
          // the slot using the anchor's teacherId as a stand-in.  This keeps
          // the full group intact in the DB so collapseGroupSlotsForDisplay
          // can find all members and show the group label correctly in the
          // timetable grid.  The slot will display the subject code but
          // the teacher initials will show as the anchor teacher's — the
          // admin can reassign it manually in the builder.
          console.warn(
            `[fanOutGroupSlots] Group subject "${entry.subjectId}" for class "${slot.classId}" ` +
            `at day ${slot.dayOfWeek} period ${slot.period} has no teacher assigned. ` +
            `Falling back to anchor teacher "${slot.teacherId}". ` +
            `Assign a teacher via the class profile or Requirements page to fix this.`
          );
          result.push({
            classId:   slot.classId,
            dayOfWeek: slot.dayOfWeek,
            period:    slot.period,
            subjectId: entry.subjectId,
            teacherId: slot.teacherId, // anchor teacher as fallback
            room:      slot.room,
          });
          continue;
        }
        result.push({
          classId:   slot.classId,
          dayOfWeek: slot.dayOfWeek,
          period:    slot.period,
          subjectId: entry.subjectId,
          teacherId: entry.teacherId,
          room:      slot.room,
        });
      }
    }
  }

  return result;
}

/**
 * collapseGroupSlotsForDisplay
 *
 * Takes the fan-out slots stored in the DB (one row per subject per teacher
 * per group slot) and collapses same-period group members back into a single
 * display slot so the timetable grid shows one cell per group instead of
 * N individual cells.
 *
 * Non-group slots are emitted unchanged.
 *
 * The returned slots are augmented with:
 *   isGroupAnchor  — true for the representative slot of a group
 *   groupName      — the group's display name
 *   groupMembers   — every subject in the group at that slot
 *   allTeachers    — every teacher name involved in the group at that slot
 *
 * Group membership is determined by CO-OCCURRENCE: a cluster of slots at the
 * same (classId, dayOfWeek, period) belongs to a group only when ALL of that
 * group's member subjects are present in the cluster.  This correctly handles
 * shared subjects (e.g. GEO in both GPC and GHC) because each group's slots
 * are at different periods — GPC occupies 5 periods and GHC occupies 5 other
 * periods; the cluster at any given period will contain exactly one group's
 * full complement of subjects.
 */
export function collapseGroupSlotsForDisplay<
  T extends {
    classId: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    internalCode: number;
    room: string | null;
  }
>(
  slots: T[],
  groupDescriptors: GroupPayloadDescriptor[]
): Array<
  T & {
    isGroupAnchor?: boolean;
    groupName?: string;
    groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
    allTeachers?: string[];
  }
> {
  type DisplaySlot = T & {
    isGroupAnchor?: boolean;
    groupName?: string;
    groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
    allTeachers?: string[];
  };

  if (groupDescriptors.length === 0) {
    // No groups configured — all slots are plain
    return slots as DisplaySlot[];
  }

  // ── Step 1: build per-group subject sets for fast membership lookup ──────
  // groupId → Set<subjectId>
  const groupSubjectSets = new Map<string, Set<string>>();
  for (const group of groupDescriptors) {
    groupSubjectSets.set(group.groupId, new Set(group.subjectIds));
  }

  // Set of ALL subjectIds that belong to any group (used to detect non-group slots)
  const allGroupSubjectIds = new Set<string>();
  for (const group of groupDescriptors) {
    for (const sid of group.subjectIds) allGroupSubjectIds.add(sid);
  }

  // groupId → { groupName, anchorSubjectId }
  const groupInfo = new Map(
    groupDescriptors.map((g) => [g.groupId, { groupName: g.name, anchorSubjectId: g.subjectIds[0] }])
  );

  // ── Step 2: cluster slots by (classId, dayOfWeek, period) ─────────────
  const clusters = new Map<string, T[]>();
  for (const slot of slots) {
    const key = `${slot.classId}|${slot.dayOfWeek}|${slot.period}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(slot);
  }

  // ── Step 3: process each cluster ────────────────────────────────────────
  const result: DisplaySlot[] = [];
  // Track which slot IDs have been consumed into a group so we don't emit them
  // as plain slots afterwards.
  const consumedSlotKeys = new Set<string>(); // "classId|subjectId|day|period"

  for (const [, clusterSlots] of clusters) {
    // Subject IDs present in this cluster
    const subjectsInCluster = new Set(clusterSlots.map((s) => s.subjectId));

    // Find all groups whose ENTIRE member set is present in this cluster
    const matchedGroups: Array<{
      groupId: string;
      groupName: string;
      anchorSubjectId: string;
      memberSlots: T[];
    }> = [];

    for (const group of groupDescriptors) {
      const memberSet = groupSubjectSets.get(group.groupId)!;
      // All group members must be present
      const allPresent = [...memberSet].every((sid) => subjectsInCluster.has(sid));
      if (!allPresent) continue;

      // Collect only the slots that belong to this group's members
      const memberSlots = clusterSlots.filter((s) => memberSet.has(s.subjectId));
      const info = groupInfo.get(group.groupId)!;
      matchedGroups.push({
        groupId:         group.groupId,
        groupName:       info.groupName,
        anchorSubjectId: info.anchorSubjectId,
        memberSlots,
      });
    }

    if (matchedGroups.length === 0) {
      // No group matched — emit all cluster slots as plain
      for (const slot of clusterSlots) {
        result.push(slot as DisplaySlot);
      }
      continue;
    }

    // Emit one collapsed display slot per matched group
    for (const { groupName, anchorSubjectId, memberSlots } of matchedGroups) {
      // Mark all member slots as consumed
      for (const s of memberSlots) {
        consumedSlotKeys.add(`${s.classId}|${s.subjectId}|${s.dayOfWeek}|${s.period}`);
      }

      // Pick the representative slot (anchor subject preferred)
      const representative =
        memberSlots.find((s) => s.subjectId === anchorSubjectId) ??
        memberSlots[0];

      const teacherNames = new Set<string>();
      const memberSubjects: Array<{ subjectId: string; subjectCode: string; subjectName: string }> = [];
      for (const s of memberSlots) {
        teacherNames.add(s.teacherName);
        memberSubjects.push({
          subjectId:   s.subjectId,
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
        });
      }

      result.push({
        ...representative,
        isGroupAnchor: true,
        groupName,
        groupMembers:  memberSubjects,
        allTeachers:   Array.from(teacherNames),
      });
    }

    // Any slots in the cluster NOT consumed by a group → emit as plain.
    // This includes partial-group slots: if a group's full member set is not
    // present in the cluster (e.g. one member has no teacher and was skipped
    // during fan-out), those individual slots would be silently dropped by the
    // !allGroupSubjectIds.has() guard.  Instead we fall back to rendering them
    // as plain cells so the lesson is at least visible to the admin.
    for (const slot of clusterSlots) {
      const k = `${slot.classId}|${slot.subjectId}|${slot.dayOfWeek}|${slot.period}`;
      if (!consumedSlotKeys.has(k)) {
        result.push(slot as DisplaySlot);
      }
    }
  }

  return result;
}
