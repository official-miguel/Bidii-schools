import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SuperAdminShell   from "@/components/super-admin/SuperAdminShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";

export const metadata = { title: "Super Admin — Bidii" };

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Strict role gate — no session goes to login; any other role goes back
  // to its own dashboard via the root dispatcher.
  if (!user) redirect("/login");
  if (user.role !== "SUPER_ADMIN") redirect("/");

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <SuperAdminShell userEmail={user.email ?? ""} isOwner={user.isPlatformOwner}>
        {children}
      </SuperAdminShell>
    </MustChangePasswordGate>
  );
}
