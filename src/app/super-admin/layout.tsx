import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SuperAdminShell   from "@/components/super-admin/SuperAdminShell";

export const metadata = { title: "Super Admin — Bidii" };

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Strict role gate — any other role gets bounced to login
  if (!user || user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return (
    <SuperAdminShell userEmail={user.email}>
      {children}
    </SuperAdminShell>
  );
}
