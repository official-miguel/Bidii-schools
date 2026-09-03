import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DiaryEntryCard from "@/components/diary/DiaryEntryCard";
import DiaryFilters from "@/components/diary/DiaryFilters";
import CreateEntryModal from "@/components/diary/CreateEntryModal";
import { BookOpen } from "lucide-react";

export default async function TeacherDiaryPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: {
      id:       true,
      fullName: true,
      subjectAssignments:         { select: { id: true }, take: 1 },
      electiveGroupTeachers:      { select: { groupId: true }, take: 1 },
      classElectiveGroupTeachers: { select: { groupId: true }, take: 1 },
    },
  });
  if (!teacher) redirect("/teacher");

  // Diary is for subject teachers only — redirect others back to academics hub
  const isSubjectTeacher =
    teacher.subjectAssignments.length > 0 ||
    teacher.electiveGroupTeachers.length > 0 ||
    teacher.classElectiveGroupTeachers.length > 0;
  if (!isSubjectTeacher) redirect("/teacher/academics");

  const typeFilter = searchParams.type || undefined;
  const LIMIT      = 20;
  const now        = new Date();
  const soon       = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [entries, dueSoon] = await Promise.all([
    prisma.diaryEntry.findMany({
      where: {
        schoolId:  user.schoolId!,
        teacherId: teacher.id,
        deletedAt: null,
        ...(typeFilter ? { entryType: typeFilter as never } : {}),
      },
      include: {
        subject: { select: { name: true } },
        targets: { include: { schoolClass: { select: { id: true, name: true } } } },
        _count:  { select: { recipients: true } },
      },
      orderBy: { createdAt: "desc" },
      take:    LIMIT,
    }),
    prisma.diaryEntry.findMany({
      where: {
        schoolId:  user.schoolId!,
        teacherId: teacher.id,
        deletedAt: null,
        dueDate:   { gte: now, lte: soon },
        entryType: { not: "ANNOUNCEMENT" },
      },
      include: {
        subject: { select: { name: true } },
        targets: { include: { schoolClass: { select: { id: true, name: true } } } },
        _count:  { select: { recipients: true } },
      },
      orderBy: { dueDate: "asc" },
      take:    5,
    }),
  ]);

  // Compute completed count for each entry for the progress bar
  const entryIds = [...entries, ...dueSoon].map((e) => e.id);
  const completedCounts = await prisma.diaryRecipient.groupBy({
    by:     ["diaryEntryId"],
    where:  { diaryEntryId: { in: entryIds }, status: "COMPLETED" },
    _count: { id: true },
  });
  const completedMap = new Map(completedCounts.map((c) => [c.diaryEntryId, c._count.id]));

  const enrichEntry = (e: typeof entries[0]) => ({
    ...e,
    completedCount: completedMap.get(e.id) ?? 0,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Diary</h1>
          <p className="text-sm text-slate dark:text-dark-muted mt-0.5">
            Your assignments and subject updates
          </p>
        </div>
        <CreateEntryModal />
      </div>

      {/* Due Soon */}
      {dueSoon.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-3">
            Due Soon
          </h2>
          <div className="space-y-2">
            {dueSoon.map((entry) => (
              <DiaryEntryCard key={entry.id} entry={enrichEntry(entry)} variant="compact" />
            ))}
          </div>
        </section>
      )}

      {/* Filters + Entries */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted">
            Recent Entries
          </h2>
          <DiaryFilters activeType={typeFilter} />
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center mb-4">
              <BookOpen className="h-7 w-7 text-teal" />
            </div>
            <p className="text-sm font-medium text-ink dark:text-dark-text">
              {typeFilter ? "No entries of this type yet" : "Your Diary is empty"}
            </p>
            <p className="text-xs text-slate dark:text-dark-muted mt-1 max-w-xs">
              {typeFilter
                ? "Try a different filter or post a new entry."
                : "Post your first assignment or subject update."}
            </p>
            <CreateEntryModal trigger="inline" />
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <DiaryEntryCard key={entry.id} entry={enrichEntry(entry)} variant="full" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
