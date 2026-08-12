import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import Top10Button from "./Top10Button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function PeriodsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true, label: true, academicYear: true },
  }) as { id: string; label: string; academicYear: string } | null;

  const periods = framework
    ? await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId!, frameworkId: framework.id },
        orderBy: [{ term: "asc" }, { name: "asc" }],
      }) as Array<{ id: string; name: string; term: number | null; academicYear: string; isCurrent: boolean }>
    : [];

  const hasCurrent = periods.some((p) => p.isCurrent);

  return (
    <div>
      <PageHeader
        title="Assessment Periods"
        description={
          framework
            ? `${framework.label} · ${framework.academicYear}`
            : "8-4-4 framework"
        }
      />

      {!framework && (
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No active 8-4-4 assessment framework found. Ask your system administrator
          to set one up.
        </div>
      )}

      {framework && periods.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No assessment periods have been created yet.
        </div>
      )}

      {!hasCurrent && periods.length > 0 && (
        <div className="mb-5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
          No period is currently marked as active. Select one below to view its
          marksheet or dashboard.
        </div>
      )}

      {periods.length > 0 && (
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs text-slate">
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Term</th>
                <th className="px-4 py-3 font-medium">Academic Year</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-line last:border-0 hover:bg-paper/40"
                >
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-slate">
                    {p.term ? `Term ${p.term}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate">{p.academicYear}</td>
                  <td className="px-4 py-3">
                    {p.isCurrent ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5">
                        Current
                      </span>
                    ) : (
                      <span className="text-slate text-xs">Past</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/principal/assessments/marksheet?periodId=${p.id}`}
                        className="text-royal text-xs hover:underline"
                      >
                        Marksheet
                      </Link>
                      <Link
                        href={`/principal/assessments/dashboard?periodId=${p.id}`}
                        className="text-royal text-xs hover:underline"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href={`/principal/assessments/report-cards?periodId=${p.id}`}
                        className="text-royal text-xs hover:underline"
                      >
                        Report Cards
                      </Link>
                      <Top10Button periodId={p.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
