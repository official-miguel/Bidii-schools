import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/moduleAccess";

/**
 * Module gate for the staff accommodation pages.
 *
 * This guard sits inside the `(module)` route group rather than on
 * /staff/accommodation itself, because that path is the Student Life hub
 * landing page — it also links to Conduct & Recognition, which is core and
 * must stay reachable for every school. Gating the whole subtree took the hub
 * down with the module; gating the group leaves the hub alone and 404s only
 * the accommodation screens.
 *
 * The route group adds nothing to the URL: these pages are still
 * /staff/accommodation/allocate and so on.
 */
export default async function StaffAccommodationModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await assertModuleEnabled(user.schoolId, "ACCOMMODATION");

  return <>{children}</>;
}
