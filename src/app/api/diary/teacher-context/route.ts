import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { getTeacherDiaryContext } from "../_lib";

export async function GET() {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  if (ctx.subjectIds.length === 0) {
    return NextResponse.json({ subjects: [], classIdsBySubject: {}, classes: [] });
  }

  const subjects = await prisma.subject.findMany({
    where: { id: { in: ctx.subjectIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Build subject → authorized classIds mapping
  const classIdsBySubject: Record<string, string[]> = {};
  for (const key of ctx.authorizedSet) {
    const [classId, subjectId] = key.split(":");
    if (!classIdsBySubject[subjectId]) classIdsBySubject[subjectId] = [];
    classIdsBySubject[subjectId].push(classId);
  }

  const allClassIds = [...new Set(Object.values(classIdsBySubject).flat())];
  const classes = await prisma.schoolClass.findMany({
    where: { id: { in: allClassIds } },
    select: { id: true, name: true, form: true, stream: true },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ subjects, classIdsBySubject, classes });
}
