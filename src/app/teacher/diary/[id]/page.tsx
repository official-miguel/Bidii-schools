import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChevronLeft } from "lucide-react";
import EntryDetailClient from "@/components/diary/EntryDetailClient";

export default async function EntryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: {
      id: true,
    },
  });
  if (!teacher) redirect("/teacher");

  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId!,
      teacherId: teacher.id,
      deletedAt: null,
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      targets: {
        include: { schoolClass: { select: { id: true, name: true } } },
      },
    },
  });

  if (!entry) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        href="/teacher/diary"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors dark:text-dark-muted dark:hover:text-dark-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Diary
      </Link>
      <EntryDetailClient entry={JSON.parse(JSON.stringify(entry))} />
    </div>
  );
}
