import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import ContextNavigation from "@/components/ContextNavigation";
import Link from "next/link";

export default async function StaffAcademicsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);

  // Route timetable link: admin view for those with manage/configure rights,
  // read-only personal schedule for everyone else (R10.3).
  const hasTimetableAdmin = !!(
    perms.TIMETABLE?.canManage || perms.TIMETABLE?.canConfigure
  );
  const timetableHref = hasTimetableAdmin
    ? "/staff/timetable"
    : "/teacher/timetable";

  const contextItems = [
    ...(perms.CLASSES?.canView
      ? [{ href: "/staff/classes", label: "Classes" }]
      : []),
    ...(perms.SUBJECTS?.canView
      ? [{ href: "/staff/subjects", label: "Subjects" }]
      : []),
    ...(perms.TIMETABLE?.canView
      ? [{ href: timetableHref, label: "Timetable" }]
      : []),
    ...(perms.ATTENDANCE?.canView
      ? [{ href: "/staff/attendance", label: "Attendance" }]
      : []),
    ...(perms.ASSESSMENTS?.canView
      ? [{ href: "/staff/assessments", label: "Assessments" }]
      : []),
    ...(perms.LIBRARY?.canView
      ? [{ href: "/staff/library", label: "Library" }]
      : []),
    { href: "/staff/calendar", label: "Calendar" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">
        Academics
      </h1>
      <p className="text-slate text-sm mb-6">
        Timetable, classes, subjects, and academic management.
      </p>
      <ContextNavigation items={contextItems} />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {contextItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-card border border-border rounded-xl p-6
                       hover:border-teal/40 hover:shadow-sm transition-all duration-150 dark:hover:border-teal/30"
          >
            <h2 className="text-base font-semibold text-foreground">
              {item.label}
            </h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
