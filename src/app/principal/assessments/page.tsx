import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import DirectorHome from "@/components/assessment/DirectorHome";
import HodHome from "@/components/assessment/HodHome";
import { prisma } from "@/lib/prisma";
import ContextNavigation from "@/components/ContextNavigation";

export default async function AssessmentsIndexPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  const isHod = actor.roles.some((r) => r.role === "HOD");

  let hodDeptId: string | undefined;
  if (isHod && actor.teacher?.id) {
    const dept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    hodDeptId = dept?.id;
  }

  return (
    <div className="space-y-5">
      {/* Desktop only — on mobile this is rendered as the top strip by AssessmentShell */}
      <div className="hidden md:block">
        <ContextNavigation
          items={[
            { href: "/principal/classes", label: "Classes" },
            { href: "/principal/subjects", label: "Subjects" },
            { href: "/principal/timetable", label: "Timetable" },
            { href: "/principal/attendance", label: "Attendance" },
            { href: "/principal/calendar", label: "Calendar" },
            { href: "/principal/assessments", label: "Exams & Analysis" },
          ]}
        />
      </div>
      
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-text">
          {isHod ? "Department Overview" : "School Overview"}
        </h1>
        <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">
          {isHod
            ? "Assessment summary for your department."
            : "School-wide assessment performance at a glance."}
        </p>
      </div>
      {isHod ? (
        <HodHome departmentId={hodDeptId} />
      ) : (
        <DirectorHome />
      )}
    </div>
  );
}
