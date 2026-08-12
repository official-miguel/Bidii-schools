import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, Chip } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import { TEACHER_ACADEMICS_NAV } from "@/lib/teacherAcademicsNav";

export default async function TeacherSubjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      applicableForms: true,
      department: { select: { id: true, name: true } },
      _count: { select: { teacherSubjects: true } },
    },
  });

  return (
    <div>
      <ContextNavigation items={TEACHER_ACADEMICS_NAV} />

      <PageHeader
        title="Subjects"
        description="The master subject list. Contact the principal to make any changes."
      />

      {subjects.length === 0 ? (
        <EmptyState message="No subjects have been set up yet." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-5 py-3.5 w-[80px] hidden sm:table-cell">Code</th>
                  <th className="px-5 py-3.5 w-[100px]">Type</th>
                  <th className="px-5 py-3.5 hidden md:table-cell">Department</th>
                  <th className="px-5 py-3.5 w-[140px] hidden sm:table-cell">Forms</th>
                  <th className="px-5 py-3.5 w-[80px] hidden lg:table-cell">Teachers</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Subject name */}
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-ink">{s.name}</span>
                      {/* Mobile: code + forms inline */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 sm:hidden">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1 py-0.5">
                          {s.code}
                        </span>
                        {(s.applicableForms as number[]).sort((a, b) => a - b).map((f) => (
                          <Chip key={f} variant="default" size="xs">F{f}</Chip>
                        ))}
                      </div>
                    </td>

                    {/* Code */}
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
                        {s.code}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3.5">
                      <Chip variant={s.type === "CORE" ? "success" : "warn"} size="xs">
                        {s.type === "CORE" ? "Core" : "Elective"}
                      </Chip>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      {s.department ? (
                        <span className="text-sm text-slate">{s.department.name}</span>
                      ) : (
                        <span className="text-sm text-slate/40 italic">No department</span>
                      )}
                    </td>

                    {/* Forms */}
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-0.5">
                        {(s.applicableForms as number[]).sort((a, b) => a - b).map((f) => (
                          <Chip key={f} variant="default" size="xs">F{f}</Chip>
                        ))}
                      </div>
                    </td>

                    {/* Teachers */}
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-sm text-slate tabular-nums">
                        {s._count.teacherSubjects}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
