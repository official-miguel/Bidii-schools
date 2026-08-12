import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function StaffStudentsPage() {
  const user = await getCurrentUser();
  const perms = await getEffectivePermissions(user!);
  if (!perms.STUDENTS?.canView) redirect("/staff");

  const students = await prisma.student.findMany({
    where: { schoolId: user!.schoolId! },
    orderBy: { fullName: "asc" },
    include: { schoolClass: { select: { name: true, form: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Students"
        description={
          perms.STUDENTS.canManage
            ? "View student records. Editing from the staff portal is coming soon — for now, ask the principal to make changes."
            : "Read-only view of student records."
        }
      />

      {students.length === 0 ? (
        <EmptyState message="No students registered yet." />
      ) : (
        <div className="bg-white border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate bg-paper">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Admission No.</th>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Parent/Guardian</th>
                <th className="px-4 py-3 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/staff/students/${s.id}`}
                      className="text-ink hover:text-teal hover:underline"
                    >
                      {s.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">{s.admissionNumber}</td>
                  <td className="px-4 py-3 text-slate">{s.schoolClass.name}</td>
                  <td className="px-4 py-3 text-slate">{s.parentName || "—"}</td>
                  <td className="px-4 py-3 text-slate">{s.parentContact || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
