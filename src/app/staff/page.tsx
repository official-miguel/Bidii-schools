import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveModulePortal } from "@/lib/permissions";
import UnifiedDashboard from "@/components/dashboard/UnifiedDashboard";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN_STAFF") redirect("/login");

  // Guard for users who navigate directly to /staff.
  // The root dispatcher already handles this at login, so this is purely a
  // safety net — e.g. a bookmarked URL or an in-app link.
  const portal = await resolveModulePortal(user);
  if (portal) redirect(portal);

  return <UnifiedDashboard user={user} rolePrefix="staff" />;
}
