import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTeacherEffectivePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import AchievementsDashboard from "@/components/records/AchievementsDashboard";

export const metadata = { title: "Achievements — Student Life" };

export default async function TeacherAchievementsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/");

  const perms = await getTeacherEffectivePermissions(user);
  const ach = perms.RECORDS_ACHIEVEMENTS;

  // canManage = true when the teacher has explicit manage or create grant.
  // AchievementsDashboard gates the "Add Achievement" button behind canManage.
  const canManage = !!(ach?.canManage || ach?.canCreate);

  return (
    <div>
      <PageHeader
        title="Achievements"
        description="Celebrate student excellence. Record and browse achievements across sports, academics, leadership, and more."
      />
      <AchievementsDashboard canManage={canManage} />
    </div>
  );
}
