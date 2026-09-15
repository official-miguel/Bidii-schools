import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/moduleAccess";

/**
 * Module gate for the accommodation pages.
 *
 * This guard sits inside the `(module)` route group rather than on
 * /principal/accommodation itself, because that path is the Student Life hub
 * landing page — it also links to Conduct & Recognition, which is core and
 * must stay reachable for every school. Gating the whole subtree took the hub
 * down with the module; gating the group leaves the hub alone and 404s only
 * the accommodation screens.
 *
 * The route group adds nothing to the URL: these pages are still
 * /principal/accommodation/overview and so on.
 */
export default async function AccommodationModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await assertModuleEnabled(user.schoolId, "ACCOMMODATION");

  return <>{children}</>;
}
