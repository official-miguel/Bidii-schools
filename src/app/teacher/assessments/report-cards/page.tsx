import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import TeacherReportCardsSelector from "./TeacherReportCardsSelector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Unified teacher report-cards page.
 * Shows all accessible classes (class-teacher's own class + any classes
 * where teacher has EXAM_OFFICER or DIRECTOR role).
 * Auto-detects framework (8-4-4, CBC, CBE) from the selected class.
 */
export default async function TeacherReportCardsPage({
  searchParams,
}: {
  searchParams: { periodId?: string; classId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // All classes.
  const allClasses = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  // Filter to those the teacher can generate report cards for.
  const accessibleClasses = allClasses.filter((c) => canGenerateReportCard(actor, c.id));

  if (accessibleClasses.length === 0) {
    return (
      <div>
        <h1 className="font-display text-xl font-semibold text-ink mb-1">Report Cards</h1>
        <EmptyState message="You don't have access to generate report cards. Only class teachers, exam officers, and directors can access this." />
      </div>
    );
  }

  const classId       = searchParams.classId  ?? accessibleClasses[0]?.id ?? "";
  const selectedClass = accessibleClasses.find((c) => c.id === classId) ?? accessibleClasses[0];
  const frameworkType = selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR";

  // Resolve periods for the selected class's framework.
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: frameworkType, isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? (await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId!, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: { id: true, name: true, academicYear: true },
      }) as Array<{ id: string; name: string; academicYear: string }>)
    : [];

  const periodId = searchParams.periodId ?? periods[0]?.id ?? "";

  const students =
    classId && periodId
      ? await prisma.student.findMany({
          where: { classId, schoolId: user.schoolId! },
          orderBy: { admissionNumber: "asc" },
          select: { id: true, fullName: true, admissionNumber: true },
        })
      : [];

  const lockClass = accessibleClasses.length === 1;

  const fwLabel =
    frameworkType === "CBE" ? "CBE" :
    frameworkType === "CBC" ? "CBC" : "8-4-4";
  const fwBadge =
    frameworkType === "CBE"  ? "bg-green-100 text-green-800"  :
    frameworkType === "CBC"  ? "bg-purple-100 text-purple-800" :
                               "bg-amber-100 text-amber-800";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Report Cards</h1>
          <p className="text-sm text-slate mt-0.5">
            Select a class and period to view individual student reports.
          </p>
        </div>
        {selectedClass && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${fwBadge}`}>
            {fwLabel} · {selectedClass.name}
          </span>
        )}
      </div>

      <TeacherReportCardsSelector
        periods={periods}
        classes={accessibleClasses.map((c) => ({ id: c.id, name: c.name }))}
        currentPeriodId={periodId}
        currentClassId={classId}
        lockClass={lockClass}
      />

      {!framework && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
          No active {fwLabel} framework found for this class.
        </div>
      )}

      {framework && periods.length === 0 && (
        <EmptyState message={`No assessment periods found for the ${fwLabel} framework.`} />
      )}

      {periodId && classId && students.length === 0 && framework && periods.length > 0 && (
        <EmptyState message="No students in this class." />
      )}

      {periodId && classId && students.length > 0 && (
        <>
          {/* Print All only for class teachers */}
          {actor.classTeacherOfId === classId && (
            <div className="flex justify-end">
              <Link
                href={`/assessments/report-card/print?periodId=${periodId}&classId=${classId}&framework=${frameworkType}`}
                target="_blank"
                className="rounded-md bg-teal text-white text-sm font-medium px-4 py-2 hover:bg-teal-dark transition-colors"
              >
                Print All ({students.length})
              </Link>
            </div>
          )}

          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs text-slate">
                  <th className="px-4 py-3 font-medium">Adm. No.</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper/40">
                    <td className="px-4 py-3 text-slate tabular-nums">{s.admissionNumber}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/teacher/students/${s.id}`}
                        className="text-ink hover:text-royal hover:underline"
                      >
                        {s.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/teacher/assessments/report-cards/${s.id}?periodId=${periodId}`}
                        className="text-royal text-xs font-medium hover:underline"
                      >
                        View Report →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
