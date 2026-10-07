import { redirect } from "next/navigation";
import TeacherAccommodationView from "@/components/accommodation/TeacherAccommodationView";
import { requireStaffAccommodationAccess } from "./access";

export const metadata = { title: "Accommodation — Staff Portal" };

/**
 * Accommodation entry point in the staff portal. Managers (the matron,
 * whatever the school calls the role) land in the full module; view-only
 * staff get the read-only dorm overview.
 *
 * This used to forward everyone to /principal/accommodation, whose layout
 * admits only the Principal, so staff clicking "View dorms" were bounced to
 * /login.
 */
export default async function StaffAccommodationPage() {
  const { canManageAll } = await requireStaffAccommodationAccess("/teacher/accommodation-details");
  if (canManageAll) redirect("/staff/accommodation/overview");

  return <TeacherAccommodationView canManageAll={false} ownDormIds={[]} />;
}
