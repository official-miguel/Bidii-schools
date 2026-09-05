import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ParentPortalShell from "@/components/parent/ParentPortalShell";
import ParentHydrator    from "@/components/parent/ParentHydrator";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import SomaAIProvider from "@/components/SomaAIProvider";

export const dynamic = "force-dynamic";

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
              id:             true,
              fullName:       true,
              admissionNumber: true,
              classId:        true,
              schoolClass:    { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!parent) {
    // Parent user exists but no Parent record — show a setup-pending state.
    return (
      <MobileDrawerProvider>
        <SomaAIProvider role="parent" schoolName="">
          <ParentPortalShell
            parentName={user.email.split("@")[0]}
            userEmail={user.email}
            schoolName=""
          >
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
              <p className="text-3xl mb-4">🏫</p>
              <p className="text-base font-semibold text-ink dark:text-dark-text">
                Account not fully set up
              </p>
              <p className="text-sm text-slate dark:text-dark-muted mt-2 max-w-sm">
                Your account hasn&apos;t been fully linked yet. Please contact the school
                office to complete setup.
              </p>
            </div>
          </ParentPortalShell>
        </SomaAIProvider>
      </MobileDrawerProvider>
    );
  }

  return (
    <MobileDrawerProvider>
      <SomaAIProvider role="parent" schoolName={parent.school.name}>
        <ParentPortalShell
          parentName={parent.name}
          userEmail={user.email}
          avatarUrl={user.avatarUrl ?? null}
          schoolName={parent.school.name}
        >
          <ParentHydrator />
          {children}
        </ParentPortalShell>
      </SomaAIProvider>
    </MobileDrawerProvider>
  );
}
