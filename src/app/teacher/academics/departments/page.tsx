import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, Chip } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";

export default async function TeacherDepartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const departments = await prisma.department.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      headTeacher: { select: { id: true, fullName: true } },
      _count: { select: { subjects: true, teachers: true } },
    },
  });

  const navItems = getTeacherAcademicsNav();

  return (
    <div>
      <ContextNavigation items={navItems} />

      <PageHeader
        title="Departments"
        description="Subject departments and their heads. Contact the principal to make any changes."
      />

      {departments.length === 0 ? (
        <EmptyState message="No departments have been set up yet." />
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Head of department</th>
                  <th className="px-5 py-3.5 w-[110px]">Subjects</th>
                  <th className="px-5 py-3.5 w-[80px]">Staff</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-ink">{d.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {d.headTeacher ? (
                        <span className="text-sm text-ink">{d.headTeacher.fullName}</span>
                      ) : (
                        <span className="text-xs text-slate/50 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Chip variant="default" size="xs">{d._count.subjects} subjects</Chip>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate tabular-nums">{d._count.teachers}</span>
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
