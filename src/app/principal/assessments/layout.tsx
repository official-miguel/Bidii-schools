import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import AssessmentShell, { type AssessmentNavItem } from "@/components/assessment/AssessmentShell";
import ContextNavigation from "@/components/ContextNavigation";

/**
 * Inner layout for /principal/assessments/**.
 *
 * Wraps every assessment sub-page in the shared inner-sidebar shell.
 * Principal always sees Exam Setup. ADMIN_STAFF with ASSESSMENT_FRAMEWORK
 * or ASSESSMENTS permission also see Exam Setup.
 */
export default async function PrincipalAssessmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Allow principals and permitted ADMIN_STAFF.
  const isPrincipal = user.role === "PRINCIPAL";
  if (!isPrincipal) {
    const permitted =
      (await requirePermission("ASSESSMENTS", "view")) ??
      (await requirePermission("ASSESSMENT_FRAMEWORK", "view"));
    if (!permitted) redirect("/");
  }

  // Exam Setup visible only to principals and those with ASSESSMENT_FRAMEWORK manage.
  const canSeeExamSetup =
    isPrincipal ||
    !!(await requirePermission("ASSESSMENT_FRAMEWORK", "manage"));

  const base = isPrincipal ? "/principal" : "/staff";

  const navItems: AssessmentNavItem[] = [
    { href: `${base}/assessments`,                        label: "Overview",          icon: "overview",         exact: true },
    { href: `${base}/assessments/marksheet`,              label: "Mark Sheets",       icon: "marksheet" },
    { href: `${base}/assessments/dashboard`,              label: "In-depth Analysis",  icon: "dashboard" },
    { href: `${base}/assessments/dept-analytics`,         label: "Dept Analytics",    icon: "dept-analytics" },
    { href: `${base}/assessments/staff-performance`,      label: "Staff Performance", icon: "performance" },
    { href: `${base}/assessments/report-cards`,           label: "Report Cards",      icon: "report-cards" },
    ...(canSeeExamSetup
      ? [{ href: `${base}/assessments/exam-setup`,        label: "Exam Setup",        icon: "exam-setup" as const }]
      : []),
  ];

  const contextNav = (
    <ContextNavigation
      items={[
        { href: `${base}/classes`,     label: "Classes"         },
        { href: `${base}/subjects`,    label: "Subjects"        },
        { href: `${base}/timetable`,   label: "Timetable"       },
        { href: `${base}/attendance`,  label: "Attendance"      },
        { href: `${base}/calendar`,    label: "Calendar"        },
        { href: `${base}/assessments`, label: "Exams & Analysis", exact: true },
      ]}
    />
  );

  return <AssessmentShell navItems={navItems} contextNav={contextNav}>{children}</AssessmentShell>;
}
