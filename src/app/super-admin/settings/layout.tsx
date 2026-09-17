import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Everything under /super-admin/settings is the platform owner's alone —
 * the OTP SMS provider, super-admin accounts, and the action history.
 *
 * The sidebar already hides the link from ordinary super admins, but a hidden
 * link is not a guard: this redirect is what actually stops someone typing
 * the URL, and every API route under it checks requireSuperAdminOwner() too.
 */
export default async function SuperAdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "SUPER_ADMIN") redirect("/login");
  if (!user.isPlatformOwner) redirect("/super-admin");

  return <>{children}</>;
}
