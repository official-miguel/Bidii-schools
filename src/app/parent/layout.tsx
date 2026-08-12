import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";

// Parent portal shows a minimal hub set — only what parents need.
import type { NavHub } from "@/lib/permissions";

const PARENT_HUBS = new Set<NavHub>(["dashboard", "calendar", "communication"]);

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || (user.role !== "PARENT" && user.role !== "STUDENT")) {
    redirect("/login");
  }

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId! },
    select: { name: true, motto: true },
  });

  const roleLabel = user.role === "STUDENT" ? "Student" : "Parent";

  return (
    <DashboardShell
      role="parent"
      roleLabel={roleLabel}
      userEmail={user.email}
      schoolName={school?.name}
      motto={school?.motto}
      visibleHubs={PARENT_HUBS}
    >
      {children}
    </DashboardShell>
  );
}
