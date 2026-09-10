import { redirect } from "next/navigation";
import { ShieldAlert, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import ContextNavigation from "@/components/ContextNavigation";

/**
 * Staff Records layout — renders the Discipline | Achievements tab strip.
 * Tabs are shown only for modules the staff member has view permission on.
 * If neither is accessible the user is redirected to /staff.
 */
export default async function StaffRecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  const disc = perms.RECORDS_DISCIPLINE;
  const ach = perms.RECORDS_ACHIEVEMENTS;
  const base = perms.RECORDS;

  const canDiscipline = !!(disc?.canView || base?.canView);
  const canAchievements = !!(ach?.canView || base?.canView);

  if (!canDiscipline && !canAchievements) redirect("/staff");

  const tabs = [
    ...(canDiscipline
      ? [
          {
            href: "/staff/records/discipline",
            label: "Discipline",
            icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
          },
        ]
      : []),
    ...(canAchievements
      ? [
          {
            href: "/staff/records/achievements",
            label: "Achievements",
            icon: <Trophy className="h-4 w-4" aria-hidden />,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="border-b border-border mb-6">
        <ContextNavigation items={tabs} />
      </div>
      {children}
    </div>
  );
}
