import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveModulePortal } from "@/lib/permissions";
import UnifiedDashboard from "@/components/dashboard/UnifiedDashboard";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // A teacher granted school-wide rights is admitted to this portal for the
  // admin screens, but their dashboard is still the teaching one. Sending them
  // to /login here would have stranded them the moment they clicked
  // "Dashboard" in the sidebar. /teacher never bounces back to /staff itself,
  // only to /staff/finance or /staff/library, so this cannot loop.
  if (user.role === "TEACHER") redirect("/teacher");

  if (user.role !== "ADMIN_STAFF" && user.role !== "BURSAR") redirect("/login");

  // Guard for users who navigate directly to /staff.
  // The root dispatcher already handles this at login, so this is purely a
  // safety net — e.g. a bookmarked URL or an in-app link.
  const portal = await resolveModulePortal(user);
  if (portal) redirect(portal);

  return <UnifiedDashboard user={user} rolePrefix="staff" />;
}
