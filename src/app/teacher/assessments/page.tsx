import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ContextNavigation from "@/components/ContextNavigation";
import AssessmentsPageTabs from "@/components/assessment/AssessmentsPageTabs";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";

export default async function TeacherAssessmentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      departmentHeadOf: { select: { id: true, name: true } },
      subjectAssignments: { select: { classId: true }, take: 1 },
      classElectiveGroupTeachers: { select: { classId: true }, take: 1 },
    },
  });

  const isHod = !!teacher?.departmentHeadOf;
  const hasSubjectAssignments =
    (teacher?.subjectAssignments.length ?? 0) > 0 ||
    (teacher?.classElectiveGroupTeachers.length ?? 0) > 0;
  const departmentId   = teacher?.departmentHeadOf?.id;
  const departmentName = teacher?.departmentHeadOf?.name;

  return (
    <div>
      <ContextNavigation items={getTeacherAcademicsNav(hasSubjectAssignments)} />
      <AssessmentsPageTabs
        isHod={isHod}
        hasSubjectAssignments={hasSubjectAssignments}
        departmentId={departmentId}
        departmentName={departmentName}
      />
    </div>
  );
}
