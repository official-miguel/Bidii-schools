import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import PeopleTiles from "@/components/teacher/PeopleTiles";

export default async function TeacherPeoplePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      classTeacherOf: { select: { id: true, name: true } },
      subjectAssignments: {
        select: {
          classId: true,
          subjectId: true,
          schoolClass: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      },
      classElectiveGroupTeachers: {
        select: {
          classId: true,
          subjectId: true,
          groupId: true,
          schoolClass: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  if (!teacher) redirect("/login");

  // Build tile data
  type Tile = {
    id: string;
    title: string;
    subTitle: string;
    classId: string;
    subjectId?: string;
    isClassTeacher: boolean;
    isElective: boolean;
  };

  const tiles: Tile[] = [];

  // Class teacher tile — pinned first
  if (teacher.classTeacherOf) {
    tiles.push({
      id: `ct-${teacher.classTeacherOf.id}`,
      title: teacher.classTeacherOf.name,
      subTitle: "Class Teacher",
      classId: teacher.classTeacherOf.id,
      isClassTeacher: true,
      isElective: false,
    });
  }

  // Subject assignment tiles (deduplicated by classId+subjectId)
  const seen = new Set<string>();
  for (const a of teacher.subjectAssignments) {
    const key = `${a.classId}-${a.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tiles.push({
      id: `st-${key}`,
      title: `${a.subject.name} — ${a.schoolClass.name}`,
      subTitle: a.subject.code,
      classId: a.classId,
      subjectId: a.subjectId,
      isClassTeacher: false,
      isElective: false,
    });
  }

  // Elective assignment tiles
  for (const e of teacher.classElectiveGroupTeachers) {
    const key = `${e.classId}-${e.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tiles.push({
      id: `el-${key}`,
      title: `${e.subject.name} — ${e.schoolClass.name}`,
      subTitle: `${e.subject.code} · Elective`,
      classId: e.classId,
      subjectId: e.subjectId,
      isClassTeacher: false,
      isElective: true,
    });
  }

  return (
    <div>
      <PageHeader
        title="People"
        description="Your classes and teaching assignments."
      />
      {tiles.length === 0 ? (
        <p className="text-sm text-slate">
          No class or subject assignments yet — ask the principal to assign you.
        </p>
      ) : (
        <PeopleTiles tiles={tiles} />
      )}
    </div>
  );
}
