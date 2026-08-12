import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import PermissionProvider from "@/components/PermissionProvider";

export default async function PrincipalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PRINCIPAL") {
    redirect("/login");
  }

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId! },
    select: { name: true, motto: true },
  });

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="principal"
        roleLabel="Principal"
        userEmail={user.email}
        avatarUrl={user.avatarUrl ?? null}
        schoolName={school?.name}
        motto={school?.motto}
      >
        <PermissionProvider schoolId={user.schoolId!} userId={user.id}>
          {children}
        </PermissionProvider>
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
