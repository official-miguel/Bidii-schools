import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/moduleAccess";

/**
 * Module gate for the Accommodation section.
 *
 * Accommodation is one of the three optional modules a super admin can switch off
 * per school. When it is off this renders the 404 page, so a direct URL is
 * indistinguishable from a route that does not exist — no "no access" notice,
 * nothing that hints the feature is there.
 */
export default async function TeacherAccommodationDetailsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await assertModuleEnabled(user.schoolId, "ACCOMMODATION");

  return <>{children}</>;
}
