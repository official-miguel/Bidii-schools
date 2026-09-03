/**
 * /parent/achievements
 *
 * Server component. Displays parent-visible achievements for the authenticated
 * parent's active child. Falls back to the first linked child when ?child= is
 * absent or unowned.
 *
 * Requirements: 8.3
 */

import { redirect } from "next/navigation";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import AchievementList from "@/components/parent/AchievementList";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { child?: string };
}

export default async function AchievementsPage({ searchParams }: Props) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) redirect("/parent-login");

  // 2. Resolve active child — fall back to first linked child
  const requestedId = searchParams?.child;
  let studentId: string;

  if (requestedId && ownsStudent(parent, requestedId)) {
    studentId = requestedId;
  } else {
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Achievements</h1>
          <div className="rounded-xl border border-warn/20 bg-warn-bg p-5">
            <p className="text-sm font-medium text-warn">
              No student linked to your account.
            </p>
          </div>
        </div>
      );
    }
    studentId = first.studentId;
  }

  // 3. Fetch student name
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true },
  });
  if (!student) redirect("/parent");

  // 4. Query achievements via AchievementStudent where isVisibleToParent = true
  const rows = await prisma.achievementStudent.findMany({
    where: {
      studentId,
      achievement: { isVisibleToParent: true },
    },
    include: {
      achievement: {
        select: {
          id:              true,
          title:           true,
          category:        true,
          description:     true,
          achievementDate: true,
          awardLevel:      true,
        },
      },
    },
    orderBy: { achievement: { achievementDate: "desc" } },
  });

  // 5. Serialise dates
  const achievements = rows.map((r) => ({
    id:              r.achievement.id,
    title:           r.achievement.title,
    category:        r.achievement.category,
    description:     r.achievement.description ?? null,
    achievementDate: r.achievement.achievementDate.toISOString(),
    awardLevel:      r.achievement.awardLevel ?? null,
  }));

  const childName = student.fullName;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
        Achievements — {childName}
      </h1>

      {/* Empty state or list */}
      {achievements.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-10 flex flex-col items-center gap-3 text-center dark:bg-dark-surface dark:border-dark-border">
          <div className="text-4xl">🏆</div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">
              No achievements yet
            </p>
            <p className="text-xs text-slate dark:text-dark-muted mt-1 max-w-xs">
              Achievements and recognition will appear here.
            </p>
          </div>
        </div>
      ) : (
        <AchievementList achievements={achievements} />
      )}
    </div>
  );
}
