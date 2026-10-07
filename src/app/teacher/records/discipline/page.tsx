import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTeacherEffectivePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import DisciplineDashboard from "@/components/records/DisciplineDashboard";

export const metadata = { title: "Discipline — Student Life" };

export default async function TeacherDisciplinePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/");

  const perms = await getTeacherEffectivePermissions(user);
  const disc = perms.RECORDS_DISCIPLINE;

  // canManage = true only if explicitly granted (e.g. Deputy Principal StaffRole).
  // Plain teachers get canView + canCreate (can add cases) but NOT manage
  // (no edit/delete). DisciplineDashboard gates the "Record Incident" button
  // behind canManage, so we pass canManage=true when either canManage or canCreate
  // is granted — giving teachers the ability to add cases without expose/delete.
  const canManage = !!(disc?.canManage || disc?.canCreate);

  return (
    <div>
      <PageHeader
        title="Discipline"
        description="Track student discipline cases. Add incidents, monitor status, and keep detailed case notes."
      />
      <DisciplineDashboard
        canManage={canManage}
        caseHrefBase="/teacher/records/discipline"
      />
    </div>
  );
}
