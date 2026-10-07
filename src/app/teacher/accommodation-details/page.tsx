import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import TeacherAccommodationView from "@/components/accommodation/TeacherAccommodationView";

export const metadata = { title: "Accommodation — Teacher Portal" };

export default async function TeacherAccommodationDetailsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/");

  const perms = await getEffectivePermissions(user);
  const acc = perms.ACCOMMODATION;

  // Every teacher gets ACCOMMODATION.canView=true in baseline permissions
  // So all teachers can access this page - no permission check needed
  
  // Determine edit scope:
  // - canManage (Matron via StaffRole): full unscoped edit across all dorms
  // - canEdit but not canManage (Dorm Master derived scope): edit own dorm only  
  // - neither (Class Teacher/Subject Teacher): read-only, no affordances
  const canManageAll = !!(acc?.canManage);
  const canEdit = !!(acc?.canEdit);

  // Find which dorms this teacher is boarding master of (for scoped edit)
  let ownDormIds: string[] = [];
  if (canEdit && !canManageAll) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { dormsBoardingMaster: { select: { id: true } } },
    });
    ownDormIds = teacher?.dormsBoardingMaster.map((d) => d.id) ?? [];
  }

  return (
    <TeacherAccommodationView
      canManageAll={canManageAll}
      ownDormIds={ownDormIds}
    />
  );
}