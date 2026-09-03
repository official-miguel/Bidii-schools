import type { ContextNavItem } from "@/components/ContextNavigation";

/**
 * Shared ContextNavigation items for the teacher academics section.
 * No Calendar — calendar lives in the sidebar.
 *
 * "Diary" is intentionally excluded from this base list — it is only added
 * for subject teachers (those with ClassSubjectTeacher / elective assignments)
 * via `getTeacherAcademicsNav()` below.
 */
export const TEACHER_ACADEMICS_NAV: ContextNavItem[] = [
  { href: "/teacher/academics/departments", label: "Departments"      },
  { href: "/teacher/academics/classes",     label: "Classes"          },
  { href: "/teacher/academics/subjects",    label: "Subjects"         },
  { href: "/teacher/timetable",             label: "Timetable"        },
  { href: "/teacher/attendance",            label: "Attendance"       },
  { href: "/teacher/assessments",           label: "Exams & Analysis" },
];

const DIARY_NAV_ITEM: ContextNavItem = { href: "/teacher/diary", label: "Diary" };

/**
 * Returns the academics nav items, appending "Diary" only when the caller
 * is a subject teacher (has at least one ClassSubjectTeacher or elective
 * group assignment).
 *
 * Pass `isSubjectTeacher = true` from server-component pages that already
 * have subject assignment data. Client-component pages (timetable, classes)
 * can call this with the value obtained from /api/teacher/me.
 */
export function getTeacherAcademicsNav(isSubjectTeacher: boolean): ContextNavItem[] {
  return isSubjectTeacher ? [...TEACHER_ACADEMICS_NAV, DIARY_NAV_ITEM] : TEACHER_ACADEMICS_NAV;
}
