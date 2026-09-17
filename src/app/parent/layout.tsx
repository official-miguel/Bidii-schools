import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ParentPortalShell from "@/components/parent/ParentPortalShell";
import ParentHydrator    from "@/components/parent/ParentHydrator";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";
import SomaAIProvider from "@/components/SomaAIProvider";
import { getEnabledOptionalModules } from "@/lib/moduleAccess";
import { getDiaryDueSoonCount, getMessagesUnreadCount } from "@/lib/parent/badgeCounts";

export const dynamic = "force-dynamic";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || (user.role !== "PARENT" && user.role !== "STUDENT")) {
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
              <p className="text-base font-semibold text-foreground">
                Account not fully set up
              </p>
              <p className="text-sm text-slate mt-2 max-w-sm">
                Your account hasn&apos;t been fully linked yet. Please contact the school
                office to complete setup.
              </p>
            </div>
          </ParentPortalShell>
        </SomaAIProvider>
      </MobileDrawerProvider>
    );
  }

  // Optional modules the school has switched off are dropped from the portal
  // nav entirely — a parent at a school without Finance never sees a fees tab.
  const enabledModules = await getEnabledOptionalModules(parent.schoolId);
  const hiddenSegs     = enabledModules.has("FEES") ? [] : ["fees"];

  const studentIds = parent.students.map((ps) => ps.studentId);

  const [diaryBadge, messagesBadge, notificationsUnread] = await Promise.all([
    getDiaryDueSoonCount(parent.schoolId, studentIds),
    getMessagesUnreadCount(parent.schoolId, studentIds, parent.messagesLastReadAt, parent.createdAt),
    prisma.parentNotification.count({
      where: { parentId: parent.id, isRead: false, module: { not: "BEHAVIOUR" } },
    }),
  ]);

  return (
    <MustChangePasswordGate
      mustChangePassword={user.mustChangePassword}
      initialPassword="admission-number"
    >
    <MobileDrawerProvider>
      <SomaAIProvider role="parent" schoolName={parent.school.name}>
        <ParentPortalShell
          parentName={parent.name}
          userEmail={user.email}
          avatarUrl={user.avatarUrl ?? null}
          schoolName={parent.school.name}
          hiddenSegs={hiddenSegs}
          diaryBadge={diaryBadge}
          messagesBadge={messagesBadge}
          unreadCount={notificationsUnread}
        >
          <ParentHydrator />
          {children}
        </ParentPortalShell>
      </SomaAIProvider>
    </MobileDrawerProvider>
    </MustChangePasswordGate>
  );
}
