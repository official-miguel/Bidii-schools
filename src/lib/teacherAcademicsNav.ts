import type { ContextNavItem } from "@/components/ContextNavigation";

/**
 * Shared ContextNavigation items for the teacher academics section.
 * No Calendar — calendar lives in the sidebar.
 *
 * Diary is available to all teachers with the TEACHER role.
 */
export const TEACHER_ACADEMICS_NAV: ContextNavItem[] = [
  { href: "/teacher/academics/departments", label: "Departments"      },
  { href: "/teacher/academics/classes",     label: "Classes"          },
  { href: "/teacher/academics/subjects",    label: "Subjects"         },
  { href: "/teacher/timetable",             label: "Timetable"        },
  { href: "/teacher/attendance",            label: "Attendance"       },
  { href: "/teacher/assessments",           label: "Exams & Analysis" },
  { href: "/teacher/diary",                 label: "Diary"            },
];

/**
 * Returns the academics nav items.
 *
 * The `isSubjectTeacher` parameter is kept for call-site compatibility but
 * no longer affects which tabs are shown — Diary is visible to all teachers.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTeacherAcademicsNav(_isSubjectTeacher?: boolean): ContextNavItem[] {
  return TEACHER_ACADEMICS_NAV;
}
