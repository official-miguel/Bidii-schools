/**
 * src/lib/timetable/liveConflictDetector.ts
 *
 * Client-side live conflict detection for the timetable builder UI.
 * Runs synchronously on every slot change with no network round-trip.
 */

export type ConflictType =
  | "TEACHER_DOUBLE_BOOKED"
  | "CLASS_DOUBLE_BOOKED"
  | "TEACHER_UNAVAILABLE"
  | "INACTIVE_DAY"
  | "WORKLOAD_EXCEEDED"
  | "LESSON_INCOMPLETE"
  | "DOUBLE_NOT_ADJACENT"
  | "EMPTY_SLOTS";

export type ConflictSeverity = "error" | "warning";

export type CellConflict = {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  action: string;
  relatedKeys: string[];
};

export type ConflictMap = Map<string, CellConflict[]>;

export type LiveSlot = {
  id: string;
  classId: string;
  className: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  subjectCode: string;
  teacherId: string;
  teacherName: string;
  room: string | null;
  isDouble: boolean;
  isManual: boolean;
  isLocked: boolean;
  lockScope?: string | null;
  lockReason?: string | null;
  // Group display properties
  isGroupAnchor?: boolean;
  groupName?: string;
  groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
  allTeachers?: string[];
  /**
   * The ElectiveGroup this slot belongs to, if any.  Set by the server-side
   * conflicts route (which has DB access) and forwarded by the builder UI
   * after collapse.  When present, two slots that share the same groupId AND
   * the same subjectId are treated as one pooled/merged teaching session
   * regardless of which classId they carry — covering the "same teacher,
   * same group subject, multiple streams" scenario (Conflict 3).
   */
  groupId?: string | null;
};

export type ConflictEngineConfig = {
  operatingDays: number[];
  periodsPerDay: number;
  blockedSlots: Set<string>;
  maxLessonsPerTeacherPerDay: number;
  teacherUnavailability: Map<string, Set<string>>;
  requiredLessons: Map<string, number>;
  doubleSubjects: Set<string>;
  /** classId → form number — used to distinguish group fan-out (same form)
   *  from genuine cross-form double-booking (different forms). */
  classFormMap: Map<string, number>;
};

// ── Staff shortage types ───────────────────────────────────────────────────

export type StaffShortageLevel = "critical" | "high" | "moderate";

export type StaffShortageSuggestion = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  totalLessonsRequired: number;
  totalLessonsCapacity: number;  // what all assigned teachers can cover per week
  deficit: number;               // lessons that can't be staffed
  assignedTeachers: number;
  estimatedExtraTeachersNeeded: number;
  affectedClasses: string[];     // class names
  level: StaffShortageLevel;
  message: string;
  suggestion: string;
};

export type StaffShortageConfig = {
  /** Map of subjectId → array of teacherIds assigned to that subject school-wide */
  subjectTeacherMap: Map<string, string[]>;
  /** Map of subjectId → { code, name } */
  subjectMeta: Map<string, { code: string; name: string }>;
  /** Map of classId → className */
  classMeta: Map<string, string>;
  /** Max lessons a teacher can teach per week (operatingDays × maxPerDay) */
  maxLessonsPerTeacherPerWeek: number;
  /** Required lessons: Map of "classId-subjectId" → lessonsPerWeek */
  requiredLessons: Map<string, number>;
};

export type ConflictSummary = {
  totalErrors: number;
  totalWarnings: number;
  conflictMap: ConflictMap;
  conflictList: Array<{ key: string; conflict: CellConflict }>;
};

export function classKey(classId: string, day: number, period: number): string {
  return `class:${classId}|${day}-${period}`;
}

export function teacherKey(teacherId: string, day: number, period: number): string {
  return `teacher:${teacherId}|${day}-${period}`;
}

export function emptyClassKey(classId: string): string {
  return `class:${classId}|empty`;
}

export function detectLiveConflicts(
  slots: LiveSlot[],
  config: ConflictEngineConfig
): ConflictSummary {
  const map = new Map<string, CellConflict[]>();

  function add(key: string, conflict: CellConflict) {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(conflict);
  }

  // Pass 1: Teacher and class double-booking
  //
  // Teacher double-booking rules:
  //   ALLOWED   — same teacher, same period, same subject, same groupId (non-null,
  //               matching on both sides) — covers both:
  //               • stream-parallel elective groups (Form 4 East/West sharing the
  //                 same period for Music within the same ElectiveGroup), and
  //               • cross-class pooled sessions (Form 2 East + Form 2 West merged
  //                 into one physical lesson by the same teacher).
  //               groupId MUST be present on both slots; a null groupId on either
  //               side means the subject is not part of a group and cannot claim
  //               this exemption, even if the subject and form happen to match.
  //   ALLOWED   — same teacher, same period, same subject, split sub-streams
  //               (Conflict 2): each sub-stream teacher gets a distinct teacherId
  //               key so the occupancy map never sees a collision — no special
  //               handling needed.
  //   CONFLICT  — same teacher, same period, different subjects (always wrong).
  //   CONFLICT  — same teacher, same period, same subject but groupId is null on
  //               either side, or groupIds differ — two unrelated bookings that
  //               happen to share a subject code are still a real double-booking.
  //
  // Class double-booking rules:
  //   ALLOWED   — multiple subjects at the same (class, period) when they all
  //               belong to the same elective group fan-out.
  //   CONFLICT  — two subjects at the same (class, period) with different
  //               subjectIds AND no group relationship (pure double-schedule).

  // teacherOcc: "teacherId|day|period" → array of { classId, subjectId, groupId }
  const teacherOcc = new Map<
    string,
    Array<{ classId: string; subjectId: string; groupId: string | null | undefined }>
  >();
  // classOcc: "classId|day|period" → array of LiveSlot
  const classOcc = new Map<string, LiveSlot[]>();

  for (const s of slots) {
    const slotK    = `${s.dayOfWeek}-${s.period}`;
    const tk       = `${s.teacherId}|${slotK}`;
    const ck       = `${s.classId}|${slotK}`;

    // ── Teacher double-booking check ────────────────────────────────────
    if (!teacherOcc.has(tk)) teacherOcc.set(tk, []);
    const priorTeacherSlots = teacherOcc.get(tk)!;

    // Track whether this slot itself caused a new conflict so we can decide
    // whether to add it to priorTeacherSlots.  We always push on clean
    // comparisons so that subsequent real conflicts are still detected.
    let thisSlotIsConflict = false;

    for (const prior of priorTeacherSlots) {
      const sameSubject = prior.subjectId === s.subjectId;

      // ── Allowed: confirmed group session (stream-parallel OR pooled) ────
      // Both slots must carry the same non-null groupId.  This is the ONLY
      // way to exempt same-teacher same-subject same-period across classes.
      // Slots without a groupId are non-group subjects; two non-group slots
      // for the same subject that coincidentally share a teacher and period
      // are a real double-booking (e.g. teacher accidentally double-assigned).
      if (
        sameSubject &&
        s.groupId != null &&
        prior.groupId != null &&
        s.groupId === prior.groupId
      ) continue;

      // ── Genuine double-booking ──────────────────────────────────────────
      const keyA = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const keyB = classKey(s.classId, s.dayOfWeek, s.period);
      const keyC = classKey(prior.classId, s.dayOfWeek, s.period);

      const priorClassName =
        slots.find((x) => x.classId === prior.classId)?.className ?? prior.classId;
      const msg = sameSubject
        ? `${s.teacherName} is double-booked — same subject (${s.subjectCode}) for ${priorClassName} and ${s.className} at period ${s.period} but they are not part of a shared elective group.`
        : `${s.teacherName} is double-booked — teaching ${priorClassName} and ${s.className} at period ${s.period}.`;
      const action = `Move one lesson to a different period or assign a different teacher.`;

      add(keyA, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyB, keyC] });
      add(keyB, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyC] });
      add(keyC, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyB] });
      thisSlotIsConflict = true;
      break;
    }

    // Always record this slot so subsequent arrivals can compare against it —
    // whether or not it conflicted with an earlier slot.  (The old code skipped
    // the push when a conflict was found, which caused false-negatives for any
    // real double-booking involving a third or later slot at the same key.)
    if (!thisSlotIsConflict) {
      priorTeacherSlots.push({ classId: s.classId, subjectId: s.subjectId, groupId: s.groupId });
    }

    // ── Class double-booking check ───────────────────────────────────────
    // Multiple subjects at the same (class, period) is only a conflict when
    // they are genuinely different, unrelated subjects.  Elective group fan-out
    // intentionally places Music + Art + Business for the same class at the same
    // period — those slots carry isGroupAnchor or groupName and are allowed.
    // Raw (uncollapsed) group slots from the server also carry groupId — two
    // different subjectIds at the same (class, period) are not a conflict when
    // both belong to the same group.
    if (!classOcc.has(ck)) classOcc.set(ck, []);
    const priorClassSlots = classOcc.get(ck)!;

    for (const prior of priorClassSlots) {
      // Collapsed display slots — group anchor flag covers all fan-out members
      if (s.isGroupAnchor || prior.isGroupAnchor || s.groupName || prior.groupName) continue;
      // Same subject twice (e.g. group fan-out before collapse) — allowed
      if (prior.subjectId === s.subjectId) continue;
      // Raw server slots carrying a groupId — same group means intentional fan-out
      if (s.groupId != null && prior.groupId != null && s.groupId === prior.groupId) continue;

      // Two different subjects at the same class period with no group relationship — real conflict
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "CLASS_DOUBLE_BOOKED",
        severity: "error",
        message: `${s.className} has two subjects at period ${s.period} — ${prior.subjectCode} and ${s.subjectCode}.`,
        action: `Remove one subject from this slot.`,
        relatedKeys: [],
      });
      break;
    }

    priorClassSlots.push(s);
  }

  // Pass 2: Teacher unavailability
  for (const s of slots) {
    const slotK = `${s.dayOfWeek}-${s.period}`;
    if (config.teacherUnavailability.get(s.teacherId)?.has(slotK)) {
      const ck = classKey(s.classId, s.dayOfWeek, s.period);
      const tk = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const msg = `${s.teacherName} is unavailable at day ${s.dayOfWeek} period ${s.period}.`;
      const action = `Reassign to another teacher or update availability.`;
      add(ck, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [tk] });
      add(tk, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [ck] });
    }
  }

  // Pass 3: Inactive day
  const activeDays = new Set(config.operatingDays);
  for (const s of slots) {
    if (!activeDays.has(s.dayOfWeek)) {
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "INACTIVE_DAY",
        severity: "error",
        message: `Day ${s.dayOfWeek} is not an active operating day.`,
        action: `Move to an active operating day.`,
        relatedKeys: [],
      });
    }
  }

  // Pass 4: Teacher daily workload
  const teacherDayLoad = new Map<string, Map<number, LiveSlot[]>>();
  for (const s of slots) {
    if (!teacherDayLoad.has(s.teacherId)) teacherDayLoad.set(s.teacherId, new Map());
    const dm = teacherDayLoad.get(s.teacherId)!;
    if (!dm.has(s.dayOfWeek)) dm.set(s.dayOfWeek, []);
    dm.get(s.dayOfWeek)!.push(s);
  }
  for (const [, dayMap] of teacherDayLoad) {
    for (const [, daySlots] of dayMap) {
      if (daySlots.length > config.maxLessonsPerTeacherPerDay) {
        for (const ds of daySlots) {
          const key = teacherKey(ds.teacherId, ds.dayOfWeek, ds.period);
          add(key, {
            type: "WORKLOAD_EXCEEDED",
            severity: "error",
            message: `${ds.teacherName} has ${daySlots.length} lessons on day ${ds.dayOfWeek}, exceeding the ${config.maxLessonsPerTeacherPerDay}-lesson daily limit.`,
            action: `Move ${daySlots.length - config.maxLessonsPerTeacherPerDay} lesson(s) to other days.`,
            relatedKeys: daySlots
              .filter((x) => x !== ds)
              .map((x) => teacherKey(x.teacherId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // Pass 5: Lesson completion warnings
  const placed = new Map<string, number>();
  for (const s of slots) {
    const k = `${s.classId}-${s.subjectId}`;
    placed.set(k, (placed.get(k) ?? 0) + 1);
  }
  for (const [reqKey, required] of config.requiredLessons) {
    const count = placed.get(reqKey) ?? 0;
    if (count < required) {
      const [classId] = reqKey.split("-");
      const classSlots = slots.filter((s) => `${s.classId}-${s.subjectId}` === reqKey);
      const msg = `${classSlots[0]?.className ?? classId} only has ${count}/${required} ${classSlots[0]?.subjectCode ?? ""} lessons scheduled.`;
      for (const s of classSlots) {
        add(classKey(s.classId, s.dayOfWeek, s.period), {
          type: "LESSON_INCOMPLETE",
          severity: "warning",
          message: msg,
          action: `Add ${required - count} more lesson(s).`,
          relatedKeys: [],
        });
      }
    }
  }

  // Pass 6: Double-lesson adjacency
  const doubleGroups = new Map<string, LiveSlot[]>();
  for (const s of slots) {
    if (!config.doubleSubjects.has(`${s.classId}-${s.subjectId}`)) continue;
    const k = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
    if (!doubleGroups.has(k)) doubleGroups.set(k, []);
    doubleGroups.get(k)!.push(s);
  }
  for (const [, group] of doubleGroups) {
    const ps = group.map((s) => s.period).sort((a, b) => a - b);
    for (let i = 0; i < ps.length - 1; i += 2) {
      if (ps[i + 1] !== ps[i] + 1) {
        const s = group[0];
        const msg = `Double-lesson for ${s.subjectCode} in ${s.className} is not consecutive (periods ${ps[i]} and ${ps[i + 1]}).`;
        for (const gs of group) {
          add(classKey(gs.classId, gs.dayOfWeek, gs.period), {
            type: "DOUBLE_NOT_ADJACENT",
            severity: "error",
            message: msg,
            action: `Move one half to make the pair consecutive.`,
            relatedKeys: group
              .filter((x) => x !== gs)
              .map((x) => classKey(x.classId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // Pass 6b: Multiple double blocks on the same day for one subject
  // Group by class + subject + day to count double blocks per day
  const doubleDayGroups = new Map<string, LiveSlot[]>();
  for (const s of slots) {
    if (!config.doubleSubjects.has(`${s.classId}-${s.subjectId}`)) continue;
    const k = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
    if (!doubleDayGroups.has(k)) doubleDayGroups.set(k, []);
    doubleDayGroups.get(k)!.push(s);
  }
  for (const [, group] of doubleDayGroups) {
    // More than 2 slots on the same day means there are multiple double blocks
    if (group.length > 2) {
      const s = group[0];
      const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.dayOfWeek] ?? `Day ${s.dayOfWeek}`;
      const msg = `${s.subjectCode} in ${s.className} has ${group.length / 2 > 1 ? Math.floor(group.length / 2) : "multiple"} double blocks on ${dayName} — only one is allowed per day.`;
      for (const gs of group) {
        add(classKey(gs.classId, gs.dayOfWeek, gs.period), {
          type: "DOUBLE_NOT_ADJACENT",
          severity: "error",
          message: msg,
          action: `Move the extra double block to a different day.`,
          relatedKeys: group
            .filter((x) => x !== gs)
            .map((x) => classKey(x.classId, x.dayOfWeek, x.period)),
        });
      }
    }
  }

  // Pass 7: Empty slots — class has fewer total placed lessons than available weekly slots
  // This fires a class-level warning so users know slots will be left blank.
  const totalWeeklySlots = config.operatingDays.length * config.periodsPerDay;
  const classPlacedTotal = new Map<string, { count: number; name: string }>();
  for (const s of slots) {
    const entry = classPlacedTotal.get(s.classId) ?? { count: 0, name: s.className };
    entry.count += 1;
    classPlacedTotal.set(s.classId, entry);
  }
  // Also capture classes that appear in requiredLessons but have zero placed slots
  for (const reqKey of config.requiredLessons.keys()) {
    const [classId] = reqKey.split("-");
    if (!classPlacedTotal.has(classId)) {
      const sample = slots.find((s) => s.classId === classId);
      classPlacedTotal.set(classId, { count: 0, name: sample?.className ?? classId });
    }
  }
  for (const [classId, { count, name }] of classPlacedTotal) {
    const emptySlots = totalWeeklySlots - count;
    if (emptySlots > 0) {
      add(emptyClassKey(classId), {
        type: "EMPTY_SLOTS",
        severity: "warning",
        message: `${name} has ${emptySlots} slot${emptySlots !== 1 ? "s" : ""} per week with no lesson — ${count} of ${totalWeeklySlots} filled.`,
        action: "Add subjects/lessons to fill the remaining slots.",
        relatedKeys: [],
      });
    }
  }

  // Compile summary
  let totalErrors = 0;
  let totalWarnings = 0;
  const conflictList: Array<{ key: string; conflict: CellConflict }> = [];
  const seen = new Set<string>();

  for (const [key, conflicts] of map) {
    for (const c of conflicts) {
      if (c.severity === "error") totalErrors++;
      if (c.severity === "warning") totalWarnings++;
      const dedupKey = `${c.type}|${c.message}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        conflictList.push({ key, conflict: c });
      }
    }
  }

  return { totalErrors, totalWarnings, conflictMap: map, conflictList };
}

// ── Staff shortage analysis ────────────────────────────────────────────────

/**
 * Analyses teacher capacity vs lesson requirements for every subject and
 * returns a prioritised list of subjects that need additional staff.
 *
 * How it works:
 *   - For each subject, sum up all lessons required across all classes.
 *   - Compute total capacity: (number of assigned teachers) × maxLessonsPerTeacherPerWeek.
 *   - Any subject where required > capacity has a staffing deficit.
 *   - Severity is rated based on how far over capacity the subject is.
 */
export function analyseStaffShortages(
  config: StaffShortageConfig
): StaffShortageSuggestion[] {
  // Aggregate total lessons required per subject
  const subjectDemand = new Map<string, { total: number; classes: string[] }>();

  for (const [reqKey, lessons] of config.requiredLessons) {
    const [classId, subjectId] = reqKey.split("-");
    if (!subjectId) continue;
    const entry = subjectDemand.get(subjectId) ?? { total: 0, classes: [] };
    entry.total += lessons;
    const className = config.classMeta.get(classId) ?? classId;
    if (!entry.classes.includes(className)) entry.classes.push(className);
    subjectDemand.set(subjectId, entry);
  }

  const suggestions: StaffShortageSuggestion[] = [];

  for (const [subjectId, { total, classes }] of subjectDemand) {
    const teachers = config.subjectTeacherMap.get(subjectId) ?? [];
    const capacity = teachers.length * config.maxLessonsPerTeacherPerWeek;
    const deficit = total - capacity;

    if (deficit <= 0) continue; // fully staffed

    const meta = config.subjectMeta.get(subjectId);
    if (!meta) continue;

    // Each additional teacher can cover maxLessonsPerTeacherPerWeek lessons
    const extraNeeded = Math.ceil(deficit / config.maxLessonsPerTeacherPerWeek);

    const percentOver = capacity > 0 ? deficit / capacity : 1;
    const level: StaffShortageLevel =
      percentOver >= 0.5 || teachers.length === 0 ? "critical"
      : percentOver >= 0.25 ? "high"
      : "moderate";

    const teacherWord = extraNeeded === 1 ? "teacher" : "teachers";
    const classesLabel = classes.length <= 3
      ? classes.join(", ")
      : `${classes.slice(0, 3).join(", ")} +${classes.length - 3} more`;

    suggestions.push({
      subjectId,
      subjectCode: meta.code,
      subjectName: meta.name,
      totalLessonsRequired: total,
      totalLessonsCapacity: capacity,
      deficit,
      assignedTeachers: teachers.length,
      estimatedExtraTeachersNeeded: extraNeeded,
      affectedClasses: classes,
      level,
      message: teachers.length === 0
        ? `${meta.code} has no teacher assigned — ${total} lesson${total !== 1 ? "s" : ""}/week needed for ${classesLabel}.`
        : `${meta.code} is understaffed — ${teachers.length} teacher${teachers.length !== 1 ? "s" : ""} can cover ${capacity} of ${total} required lessons/week for ${classesLabel}.`,
      suggestion: `Add ${extraNeeded} more ${teacherWord} for ${meta.code} to cover the ${deficit}-lesson shortfall.`,
    });
  }

  // Sort: critical first, then by deficit size
  return suggestions.sort((a, b) => {
    const lvl = { critical: 0, high: 1, moderate: 2 };
    const diff = lvl[a.level] - lvl[b.level];
    return diff !== 0 ? diff : b.deficit - a.deficit;
  });
}

// ── Actual-placement shortage analysis ────────────────────────────────────

/**
 * Config for analyseActualShortages — uses the real placed-vs-required counts
 * from the solver output instead of theoretical capacity maths.
 */
export type ActualShortageConfig = {
  /**
   * Map of "classId-subjectId" → lessonsPerWeek (what was required)
   */
  requiredLessons: Map<string, number>;
  /**
   * Map of "classId-subjectId" → lessons actually placed by the solver.
   * Any key missing from this map means 0 lessons were placed.
   */
  placedLessons: Map<string, number>;
  /** Map of subjectId → { code, name } */
  subjectMeta: Map<string, { code: string; name: string }>;
  /** Map of classId → className */
  classMeta: Map<string, string>;
  /** Map of subjectId → array of teacherIds assigned to that subject school-wide */
  subjectTeacherMap: Map<string, string[]>;
  /** Max lessons a teacher can teach per week (operatingDays × maxPerDay) */
  maxLessonsPerTeacherPerWeek: number;
};

/**
 * Derives teacher-shortage suggestions from the actual solver output.
 *
 * Unlike analyseStaffShortages (which only flags subjects where total teacher
 * capacity < total demand), this function flags EVERY subject where fewer
 * lessons were placed than required — regardless of whether the cause is
 * insufficient teacher capacity, teacher unavailability, daily-cap exhaustion,
 * or linked-group sync constraints.
 *
 * Returns the same StaffShortageSuggestion[] shape so the two lists can be
 * merged in the API route.
 */
export function analyseActualShortages(
  config: ActualShortageConfig
): StaffShortageSuggestion[] {
  // Aggregate per-subject: total required, total placed, affected classes
  const subjectStats = new Map<
    string,
    { required: number; placed: number; classes: string[] }
  >();

  for (const [reqKey, required] of config.requiredLessons) {
    const dashIdx = reqKey.indexOf("-");
    if (dashIdx === -1) continue;
    const classId   = reqKey.slice(0, dashIdx);
    const subjectId = reqKey.slice(dashIdx + 1);

    const placed = config.placedLessons.get(reqKey) ?? 0;
    const entry  = subjectStats.get(subjectId) ?? { required: 0, placed: 0, classes: [] };
    entry.required += required;
    entry.placed   += placed;

    const className = config.classMeta.get(classId) ?? classId;
    if (!entry.classes.includes(className)) entry.classes.push(className);
    subjectStats.set(subjectId, entry);
  }

  const suggestions: StaffShortageSuggestion[] = [];

  for (const [subjectId, { required, placed, classes }] of subjectStats) {
    const shortfall = required - placed;
    if (shortfall <= 0) continue; // fully scheduled — no shortage

    const meta = config.subjectMeta.get(subjectId);
    if (!meta) continue;

    const teachers  = config.subjectTeacherMap.get(subjectId) ?? [];
    const capacity  = teachers.length * config.maxLessonsPerTeacherPerWeek;
    const extraNeeded = Math.ceil(shortfall / config.maxLessonsPerTeacherPerWeek);

    // Severity: base on how much of the required load is unscheduled
    const percentMissed = required > 0 ? shortfall / required : 1;
    const level: StaffShortageLevel =
      percentMissed >= 0.5 || teachers.length === 0 ? "critical"
      : percentMissed >= 0.25 ? "high"
      : "moderate";

    const classesLabel = classes.length <= 3
      ? classes.join(", ")
      : `${classes.slice(0, 3).join(", ")} +${classes.length - 3} more`;

    const teacherWord = extraNeeded === 1 ? "teacher" : "teachers";

    const message = teachers.length === 0
      ? `${meta.code} has no teacher assigned — ${shortfall} of ${required} lesson${required !== 1 ? "s" : ""}/week unscheduled for ${classesLabel}.`
      : `${meta.code}: ${placed}/${required} lessons scheduled — ${shortfall} lesson${shortfall !== 1 ? "s" : ""} unplaced for ${classesLabel}. Teacher${teachers.length !== 1 ? "s" : ""} may have unavailability or daily-cap limits.`;

    suggestions.push({
      subjectId,
      subjectCode:    meta.code,
      subjectName:    meta.name,
      totalLessonsRequired:  required,
      totalLessonsCapacity:  capacity,
      deficit:               shortfall,
      assignedTeachers:      teachers.length,
      estimatedExtraTeachersNeeded: extraNeeded,
      affectedClasses: classes,
      level,
      message,
      suggestion: teachers.length === 0
        ? `Assign a teacher to ${meta.code} and regenerate.`
        : `Add ${extraNeeded} more ${teacherWord} for ${meta.code}, or reduce teacher unavailability blocks to cover the ${shortfall}-lesson shortfall.`,
    });
  }

  // Sort: critical first, then by shortfall size
  return suggestions.sort((a, b) => {
    const lvl = { critical: 0, high: 1, moderate: 2 };
    const diff = lvl[a.level] - lvl[b.level];
    return diff !== 0 ? diff : b.deficit - a.deficit;
  });
}
