import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import ReportPageWithGraph from "@/components/assessment/ReportPageWithGraph";

export default async function TeacherStudentReportPage({
  params,
  searchParams,
}: {
  params: { studentId: string };
  searchParams: { periodId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const { studentId } = params;
  const periodId = searchParams.periodId ?? "";
  if (!periodId) redirect("/teacher/assessments/report-cards");

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: {
      id: true, fullName: true, admissionNumber: true, classId: true,
      schoolClass: { select: { id: true, name: true, frameworkType: true } },
    },
  });
  if (!student) redirect("/teacher/assessments/report-cards");

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, student.classId)) redirect("/teacher/assessments/report-cards");

  const frameworkType = student.schoolClass.frameworkType as "EIGHT_FOUR_FOUR" | "CBC" | "CBE";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">{student.fullName}</h1>
        <p className="text-sm text-slate mt-0.5">
          {student.schoolClass.name} · Adm. {student.admissionNumber}
        </p>
      </div>
      <ReportPageWithGraph
        studentId={studentId}
        periodId={periodId}
        frameworkType={frameworkType}
        autoLoad
      />
    </div>
  );
}
