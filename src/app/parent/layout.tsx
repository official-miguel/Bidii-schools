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
    redirect("/parent-login");
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
    redirect("/parent-login");
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
