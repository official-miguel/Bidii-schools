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
 *  - BURSAR (legacy enum)                  → same as ADMIN_STAFF
 *  - PARENT / STUDENT                      → /parent
 *  - SUPER_ADMIN                           → /super-admin
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

    // Staff roles (bursar, librarian, ...) are school-defined and named freely;
    // the legacy BURSAR enum is routed like any other staff account, by the
    // permissions it holds.
    case "ADMIN_STAFF":
    case "BURSAR": {
      const portal = await resolveModulePortal(user);
      redirect(portal ?? "/staff");
    }

    case "PARENT":
    case "STUDENT":
      redirect("/parent");

    case "SUPER_ADMIN":
      redirect("/super-admin");

    default:
      // Fallback for any other roles (WATCHMAN, MARKER, etc.)
      redirect("/login");
  }
}
