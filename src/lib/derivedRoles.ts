/**
 * src/lib/derivedRoles.ts
 *
 * Derived roles are capabilities automatically computed at query time from
 * the current state of operational assignments — NOT stored as separate role
 * records. They activate and deactivate instantly as assignments change.
 *
 * Resolution model:
 *   - Subject Teacher   → teacher has ≥1 TimetableSlot / TeacherSubject assignment
 *   - Class Teacher     → teacher.classTeacherOf is non-null
 *   - Head of Dept      → teacher.departmentHeadOf is non-null
 *   - Dorm Master       → teacher.dormsBoardingMaster has ≥1 entry
 *
 * Assigned roles (via UserStaffRole / StaffRole) are deliberately separate
 * and are handled by getEffectivePermissions() in permissions.ts.
 * When an assigned role's scope supersedes a derived role (e.g. school-wide
 * Matron supersedes per-dorm Dorm Master), the caller merges them and the
 * broader scope wins for UI purposes.
 */

import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DerivedRoleKind =
  | "SUBJECT_TEACHER"
  | "CLASS_TEACHER"
  | "HEAD_OF_DEPT"
  | "DORM_MASTER";

export interface SubjectTeacherRole {
  kind: "SUBJECT_TEACHER";
  subjects: { id: string; name: string; code: string }[];
  /** Unique class IDs from timetable where this teacher appears */
  classIds: string[];
}

export interface ClassTeacherRole {
  kind: "CLASS_TEACHER";
  classId: string;
  className: string;
  form: number;
}

export interface HeadOfDeptRole {
  kind: "HEAD_OF_DEPT";
  departmentId: string;
  departmentName: string;
}

export interface DormMasterRole {
  kind: "DORM_MASTER";
  dorms: { id: string; name: string; totalCapacity: number; genderPolicy: string }[];
}

export type DerivedRole =
  | SubjectTeacherRole
  | ClassTeacherRole
  | HeadOfDeptRole
  | DormMasterRole;

export interface DerivedRolesResult {
  subjectTeacher: SubjectTeacherRole | null;
  classTeacher:   ClassTeacherRole   | null;
  headOfDept:     HeadOfDeptRole     | null;
  dormMaster:     DormMasterRole     | null;
  /** All active derived kinds as a flat set for quick membership checks */
  activeKinds:    Set<DerivedRoleKind>;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDerivedRoles
//
// Queries the current DB state for a teacher and returns every derived role
// they hold at this exact moment. Deleted classes / dorms / departments
// naturally return no rows and the corresponding role is absent.
// ─────────────────────────────────────────────────────────────────────────────

export async function computeDerivedRoles(
  teacherUserId: string,
  schoolId: string
): Promise<DerivedRolesResult> {
  const result: DerivedRolesResult = {
    subjectTeacher: null,
    classTeacher:   null,
    headOfDept:     null,
    dormMaster:     null,
    activeKinds:    new Set(),
  };

  const teacher = await prisma.teacher.findUnique({
    where: { userId: teacherUserId },
    select: {
      id: true,
      // Subject teacher: direct subject assignments
      teacherSubjects: {
        select: {
          subject: { select: { id: true, name: true, code: true } },
        },
      },
      // Subject teacher: timetable slots (gives class context)
      timetableSlots: {
        select: { schoolClass: { select: { id: true } } },
      },
      // Class teacher: the single class they are assigned to
      classTeacherOf: {
        select: { id: true, name: true, form: true },
      },
      // HOD: the department they head
      departmentHeadOf: {
        select: { id: true, name: true },
      },
      // Dorm master: dormitories this teacher is assigned to
      dormsBoardingMaster: {
        where: { schoolId },
        select: {
          id: true, name: true, totalCapacity: true, genderPolicy: true,
        },
      },
    },
  });

  if (!teacher) return result;

  // ── Subject Teacher ────────────────────────────────────────────────────────
  if (teacher.teacherSubjects.length > 0) {
    const classIds = [
      ...new Set(teacher.timetableSlots.map((s) => s.schoolClass.id)),
    ];
    result.subjectTeacher = {
      kind: "SUBJECT_TEACHER",
      subjects: teacher.teacherSubjects.map((ts) => ts.subject),
      classIds,
    };
    result.activeKinds.add("SUBJECT_TEACHER");
  }

  // ── Class Teacher ──────────────────────────────────────────────────────────
  if (teacher.classTeacherOf) {
    result.classTeacher = {
      kind:      "CLASS_TEACHER",
      classId:   teacher.classTeacherOf.id,
      className: teacher.classTeacherOf.name,
      form:      teacher.classTeacherOf.form,
    };
    result.activeKinds.add("CLASS_TEACHER");
  }

  // ── Head of Department ─────────────────────────────────────────────────────
  if (teacher.departmentHeadOf) {
    result.headOfDept = {
      kind:           "HEAD_OF_DEPT",
      departmentId:   teacher.departmentHeadOf.id,
      departmentName: teacher.departmentHeadOf.name,
    };
    result.activeKinds.add("HEAD_OF_DEPT");
  }

  // ── Dorm Master ────────────────────────────────────────────────────────────
  if (teacher.dormsBoardingMaster.length > 0) {
    result.dormMaster = {
      kind:  "DORM_MASTER",
      dorms: teacher.dormsBoardingMaster,
    };
    result.activeKinds.add("DORM_MASTER");
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDerivedRolesByTeacherId
//
// Same as computeDerivedRoles but accepts the Teacher.id (not User.id).
// Used when the caller already has the teacher record.
// ─────────────────────────────────────────────────────────────────────────────

export async function computeDerivedRolesByTeacherId(
  teacherId: string,
  schoolId: string
): Promise<DerivedRolesResult> {
  const result: DerivedRolesResult = {
    subjectTeacher: null,
    classTeacher:   null,
    headOfDept:     null,
    dormMaster:     null,
    activeKinds:    new Set(),
  };

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      teacherSubjects: {
        select: { subject: { select: { id: true, name: true, code: true } } },
      },
      timetableSlots: {
        select: { schoolClass: { select: { id: true } } },
      },
      classTeacherOf: {
        select: { id: true, name: true, form: true },
      },
      departmentHeadOf: {
        select: { id: true, name: true },
      },
      dormsBoardingMaster: {
        where: { schoolId },
        select: { id: true, name: true, totalCapacity: true, genderPolicy: true },
      },
    },
  });

  if (!teacher) return result;

  if (teacher.teacherSubjects.length > 0) {
    const classIds = [...new Set(teacher.timetableSlots.map((s) => s.schoolClass.id))];
    result.subjectTeacher = {
      kind: "SUBJECT_TEACHER",
      subjects: teacher.teacherSubjects.map((ts) => ts.subject),
      classIds,
    };
    result.activeKinds.add("SUBJECT_TEACHER");
  }

  if (teacher.classTeacherOf) {
    result.classTeacher = {
      kind:      "CLASS_TEACHER",
      classId:   teacher.classTeacherOf.id,
      className: teacher.classTeacherOf.name,
      form:      teacher.classTeacherOf.form,
    };
    result.activeKinds.add("CLASS_TEACHER");
  }

  if (teacher.departmentHeadOf) {
    result.headOfDept = {
      kind:           "HEAD_OF_DEPT",
      departmentId:   teacher.departmentHeadOf.id,
      departmentName: teacher.departmentHeadOf.name,
    };
    result.activeKinds.add("HEAD_OF_DEPT");
  }

  if (teacher.dormsBoardingMaster.length > 0) {
    result.dormMaster = {
      kind:  "DORM_MASTER",
      dorms: teacher.dormsBoardingMaster,
    };
    result.activeKinds.add("DORM_MASTER");
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// hasAnyDerivedRole — fast boolean check (no data hydration)
// ─────────────────────────────────────────────────────────────────────────────


