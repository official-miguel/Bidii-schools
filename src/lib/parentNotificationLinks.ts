/**
 * Where a parent notification takes you when tapped — shared by the in-app
 * bell (ServerNotificationSync) and the Web Push sent by notifyParents, so a
 * tap lands on the same page from either.
 */
export const PARENT_MODULE_HREF: Record<string, string> = {
  DIARY:        "/parent/diary",
  ACADEMIC:     "/parent/results",
  ATTENDANCE:   "/parent/attendance",
  FEES:         "/parent/fees",
  BEHAVIOUR:    "/parent/behaviour",
  ACHIEVEMENTS: "/parent/achievements",
  CALENDAR:     "/parent/calendar",
};
