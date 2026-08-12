import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

/**
 * GET /api/class-profiles
 *
 * Returns all classes for the school with subject assignment summary:
 * how many core subjects and elective subjects are assigned to each class.
 * This drives the class-profiles list page.
 */
export async function GET() {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      form: true,
      stream: true,
      frameworkType: true,
      classTeacher: { select: { id: true, fullName: true } },
      _count: { select: { students: true } },
    },
  });

  // For each class, count how many subjects from the master list apply to
  // it based on applicableForms and their type.
  // We do one bulk query and group in JS to avoid N+1.
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId },
    select: { id: true, type: true, applicableForms: true },
  });

  // classSubjectOverrides: per-class type overrides stored in ClassSubjectProfile
  // (if the model exists). For now we rely on the subject's global type and
  // applicableForms to compute counts.
  const result = classes.map((cls) => {
    const applicable = subjects.filter((s) => s.applicableForms.includes(cls.form));
    const coreCount = applicable.filter((s) => s.type === "CORE").length;
    const electiveCount = applicable.filter((s) => s.type === "ELECTIVE").length;
    return {
      ...cls,
      subjectCounts: { core: coreCount, elective: electiveCount, total: applicable.length },
    };
  });

  return NextResponse.json(result);
}
