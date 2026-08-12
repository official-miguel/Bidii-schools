import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import {
  buildReportCard,
  buildClassReportCards,
} from "@/lib/assessment/reportCard844";
import {
  buildCbeReportCard,
  buildCbeClassReportCards,
} from "@/lib/assessment/reportCardCbe";
import ReportCard from "@/components/assessment/ReportCard";
import CbeReportCard from "@/components/assessment/CbeReportCard";
import PrintBar from "@/components/PrintBar";
import { prisma } from "@/lib/prisma";

/**
 * Print route — no layout wrapper.
 *
 * Query params:
 *   periodId (required)
 *   studentId  — single student
 *   classId    — class-wide (all students)
 *   framework  — "CBE" | "844" (optional; auto-detected from class frameworkType when omitted)
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: {
    periodId?: string;
    studentId?: string;
    classId?: string;
    framework?: string;
  };
}) {
  const { periodId, studentId, classId, framework: fwParam } = searchParams;

  if (!periodId || (!studentId && !classId)) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // Resolve the framework type: explicit param > student's class > classId
  async function resolveFramework(cid: string): Promise<"CBE" | "844"> {
    if (fwParam === "CBE") return "CBE";
    if (fwParam === "844") return "844";
    const sc = await prisma.schoolClass.findFirst({
      where: { id: cid, schoolId: user!.schoolId },
      select: { frameworkType: true },
    });
    return (sc?.frameworkType as string) === "CBE" ? "CBE" : "844";
  }

  // ---- Single-student mode ----
  if (studentId) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId! },
      select: { classId: true, fullName: true },
    });
    if (!student) redirect("/");
    if (!canGenerateReportCard(actor, student.classId)) redirect("/");

    const fw = await resolveFramework(student.classId);

    if (fw === "CBE") {
      const data = await buildCbeReportCard(studentId, periodId, user.schoolId!);
      if (!data) redirect("/");
      return (
        <>
          <PrintBar title={`CBE Report Card — ${data.student.fullName}`} />
          <div className="max-w-3xl mx-auto py-6 px-4">
            <CbeReportCard data={data} />
          </div>
          <PrintStyles />
        </>
      );
    }

    // 8-4-4
    const data = await buildReportCard(studentId, periodId, user.schoolId!);
    if (!data) redirect("/");
    return (
      <>
        <PrintBar title={`Report Card — ${data.student.fullName}`} />
        <div className="max-w-3xl mx-auto py-6 px-4">
          <ReportCard data={data} />
        </div>
        <PrintStyles />
      </>
    );
  }

  // ---- Class-wide mode ----
  if (!canGenerateReportCard(actor, classId!)) redirect("/");

  const fw = await resolveFramework(classId!);

  if (fw === "CBE") {
    const classData = await buildCbeClassReportCards(classId!, periodId, user.schoolId!);
    if (!classData) redirect("/");
    return (
      <>
        <PrintBar
          title={`CBE Report Cards — ${classData.schoolClass.name} · ${classData.period.name}`}
        />
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-0">
          {classData.students.map((d) => (
            <CbeReportCard key={d.student.id} data={d} />
          ))}
        </div>
        <PrintStyles />
      </>
    );
  }

  // 8-4-4
  const classData = await buildClassReportCards(classId!, periodId, user.schoolId!);
  if (!classData) redirect("/");
  return (
    <>
      <PrintBar
        title={`Report Cards — ${classData.schoolClass.name} · ${classData.period.name}`}
      />
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-0">
        {classData.students.map((d) => (
          <ReportCard key={d.student.id} data={d} />
        ))}
      </div>
      <PrintStyles />
    </>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        .no-print, [data-no-print] { display: none !important; }
        body { background: white; }
        .report-card-page { page-break-after: always; }
        .report-card-page:last-child { page-break-after: avoid; }
      }
    `}</style>
  );
}
