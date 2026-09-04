import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import ParentHydrator from "@/components/parent/ParentHydrator";
import type { NavHub } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Parent portal shows only the parent-specific hub.
const PARENT_HUBS = new Set<NavHub>(["parent"]);

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PARENT") {
    redirect("/login");
  }

  const parent = await prisma.parent.findUnique({
    where: { userId: user.id },
    include: {
      school: {
        select: { name: true, motto: true },
      },
      students: {
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              admissionNumber: true,
              classId: true,
              schoolClass: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!parent) {
    // Parent user exists but no Parent record — show a setup-pending state
    // rather than bouncing them back to the login page they just came from.
    return (
      <DashboardShell
        role="parent"
        roleLabel="Parent"
        userEmail={user.email}
        schoolName=""
        visibleHubs={PARENT_HUBS}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <p className="text-3xl mb-4">🏫</p>
          <p className="text-base font-semibold text-ink dark:text-dark-text">Account not fully set up</p>
          <p className="text-sm text-slate dark:text-dark-muted mt-2 max-w-sm">
            Your account hasn&apos;t been fully linked yet. Please contact the school office to complete setup.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role="parent"
      roleLabel={parent.name}
      userEmail={user.email}
      schoolName={parent.school.name}
      motto={parent.school.motto ?? undefined}
      visibleHubs={PARENT_HUBS}
    >
      <ParentHydrator />
      {children}
    </DashboardShell>
  );
}
