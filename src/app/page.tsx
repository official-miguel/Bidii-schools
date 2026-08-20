import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveModulePortal } from "@/lib/permissions";

/**
 * Home page dispatcher — redirects authenticated users to their role-specific dashboard.
 *
 * For TEACHER and ADMIN_STAFF the dispatcher first checks whether the user
 * has been assigned a role that grants FEES or LIBRARY module management.
 * If so they land directly in the dedicated portal (/staff/finance or
 * /staff/library) without ever loading the default dashboard — eliminating
 * the extra round-trip that previously made those accounts feel slow.
 *
 * Route tree:
 *  - PRINCIPAL                             → /principal
 *  - TEACHER  with FEES manage             → /staff/finance
 *  - TEACHER  with LIBRARY manage          → /staff/library
 *  - TEACHER  (no module portal)           → /teacher
 *  - ADMIN_STAFF with FEES manage          → /staff/finance
 *  - ADMIN_STAFF with LIBRARY manage       → /staff/library
 *  - ADMIN_STAFF with broad oversight role → /staff
 *  - ADMIN_STAFF (no module portal)        → /staff
 *  - PARENT / STUDENT                      → /parent
 *  - (no session)                          → /login
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  switch (user.role) {
    case "PRINCIPAL":
      redirect("/principal");

    case "TEACHER": {
      const portal = await resolveModulePortal(user);
      redirect(portal ?? "/teacher");
    }

    case "ADMIN_STAFF": {
      const portal = await resolveModulePortal(user);
      redirect(portal ?? "/staff");
    }

    case "PARENT":
    case "STUDENT":
      redirect("/parent");

    default:
      // Fallback for any other roles (WATCHMAN, MARKER, etc.)
      redirect("/login");
  }
}
