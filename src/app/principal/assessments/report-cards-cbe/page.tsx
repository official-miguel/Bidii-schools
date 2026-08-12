import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import ReportCardsSelector from "../report-cards/ReportCardsSelector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function CbeReportCardsPage({
  searchParams,
}: {
  searchParams: { periodId?: string; classId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  // Only CBE framework
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId!, frameworkId: framework.id },
        orderBy: [{ term: "asc" }, { name: "asc" }],
        select: { id: true, name: true, academicYear: true },
      }) as Array<{ id: string; name: string; academicYear: string }>
    : [];

  // Only CBE classes
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId!, frameworkType: "CBE" as never },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  if (!framework || periods.length === 0) {
    return (
      <div>
        <PageHeader title="CBE Report Cards" />
        <EmptyState message="No active CBE framework or periods found. Set up a CBE framework and add periods first." />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div>
        <PageHeader title="CBE Report Cards" />
        <EmptyState message="No CBE classes found. Assign framework type 'CBE' to classes in the Classes section." />
      </div>
    );
  }

  const periodId = searchParams.periodId ?? periods[0]?.id ?? "";
  const classId  = searchParams.classId  ?? classes[0]?.id ?? "";

  const students =
    periodId && classId
      ? await prisma.student.findMany({
          where: { classId, schoolId: user.schoolId! },
          orderBy: { admissionNumber: "asc" },
          select: { id: true, fullName: true, admissionNumber: true },
        })
      : [];

  return (
    <div>
      <PageHeader
        title="CBE Report Cards"
        description="Generate and print individual or class-wide CBE report cards. Template auto-selected (Junior/Senior) by framework content."
      />

      <ReportCardsSelector
        periods={periods}
        classes={classes}
        currentPeriodId={periodId}
        currentClassId={classId}
      />

      {periodId && classId && students.length === 0 && (
        <EmptyState message="No students in this class." />
      )}

      {periodId && classId && students.length > 0 && (
        <>
          <div className="flex justify-end mb-4">
            <Link
              href={`/assessments/report-card/print?periodId=${periodId}&classId=${classId}&framework=CBE`}
              target="_blank"
              className="rounded-md bg-teal text-white text-sm font-medium px-4 py-2 hover:bg-teal-dark transition-colors"
            >
              Print All ({students.length})
            </Link>
          </div>

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
                    <td className="px-4 py-3 font-medium text-ink">{s.fullName}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/assessments/report-card/print?periodId=${periodId}&studentId=${s.id}&framework=CBE`}
                        target="_blank"
                        className="text-royal text-xs hover:underline"
                      >
                        Print
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
