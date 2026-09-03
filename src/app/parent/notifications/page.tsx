export const dynamic = "force-dynamic";

/**
 * /parent/notifications
 *
 * Server component - fetches notifications server-side and passes them to
 * the client components for interactive read/mark-all/pagination behaviour.
 */

import { redirect } from "next/navigation";
import { requireParent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import NotificationModuleFilter from "@/components/parent/NotificationModuleFilter";
import NotificationList from "@/components/parent/NotificationList";

interface SearchParams {
  module?: string;
  page?: string;
}

interface Props {
  searchParams: SearchParams;
}

export default async function ParentNotificationsPage({ searchParams }: Props) {
  const parent = await requireParent();
  if (!parent) redirect("/parent-login");

  // Renamed from `module` to `activeModule` to avoid the no-assign-module-variable error.
  const activeModule = searchParams.module || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const skip = (page - 1) * 25;

  const where = {
    parentId: parent.id,
    ...(activeModule ? { module: activeModule } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.parentNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: 25,
    }),
    prisma.parentNotification.count({ where }),
    prisma.parentNotification.count({
      where: { parentId: parent.id, isRead: false },
    }),
  ]);

  return (
    <main className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-ink dark:text-dark-text">
          Notifications
        </h1>
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread`}
            className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5
                       rounded-full bg-danger text-white text-xs font-semibold"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
      <NotificationModuleFilter activeModule={activeModule} />
      <div className="mt-4">
        <NotificationList
          initialNotifications={notifications}
          total={total}
          unreadCount={unreadCount}
        />
      </div>
    </main>
  );
}
