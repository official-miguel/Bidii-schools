import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { computeTeacherRanking } from "@/lib/assessment/teacherRanking";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/assessments/staff/ranking
 *
 * Query params:
 *   periodId     (required)
 *   scope        "school" | "department"  (default: "school")
 *   departmentId  required when scope=department
 *
 * Response shape:
 * {
 *   scope,
 *   top3,            // top 3 of whichever scope was requested
 *   fullList,        // all results in scope (empty [] for plain teachers in school scope)
 *   ownRow,          // caller's own row (null if not a teacher)
 *   departments,     // all dept stubs — populated for principal/director/HOD only
 *   ownDepartmentId, // the caller's primary dept id (helps client pre-select tab)
 * }
 *
 * Visibility rules:
 *   scope=school:
 *     TEACHER         → fullList = []  (top3 + ownRow only)
 *     HOD             → fullList scoped to their dept (same as dept scope)
 *     Principal/Dir   → fullList = all teachers
 *
 *   scope=department  (departmentId required):
 *     TEACHER         → fullList = full list of THAT dept (they can see peers)
 *     HOD             → fullList = their dept (403 if they request another dept)
 *     Principal/Dir   → fullList = requested dept
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  const params     = req.nextUrl.searchParams;
  const periodId   = params.get("periodId");
  const scope      = (params.get("scope") ?? "school") as "school" | "department";
  const departmentId = params.get("departmentId") ?? undefined;

  if (!periodId) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }
  if (scope === "department" && !departmentId) {
    return NextResponse.json(
      { error: "departmentId is required when scope=department." },
      { status: 400 }
    );
  }

  // ---- Role flags -----------------------------------------------------------
  const isPlainTeacher = user.role === "TEACHER" && !canAccessDashboard(actor);
  const isHod          = actor.roles.some((r) => r.role === "HOD");
  const canSeeAll      = canAccessDashboard(actor); // HOD, Director, Principal, Exam Officer

  // ---- Resolve HOD's own department ----------------------------------------
  let hodDeptId: string | undefined;
  if (isHod && actor.teacher?.id) {
    const dept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    hodDeptId = dept?.id;
  }

  // ---- HOD dept-access guard -----------------------------------------------
  if (isHod && scope === "department" && departmentId && departmentId !== hodDeptId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- Resolve teacher's own department (for plain teachers) ---------------
  let teacherDeptId: string | undefined;
  if (isPlainTeacher && actor.teacher?.id) {
    const t = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    teacherDeptId = t?.primaryDepartmentId ?? undefined;
  }

  // ---- Determine what scope to compute ranking for -------------------------
  let rankingDeptId: string | undefined;
  if (scope === "department") {
    rankingDeptId = departmentId;
  } else if (isHod) {
    // school scope for HOD still returns their dept list (consistent with original behaviour)
    rankingDeptId = hodDeptId;
  }
  // For plain teachers in school scope we still compute school-wide ranking
  // so top3 is meaningful, but we'll suppress fullList below.

  const allResults = await computeTeacherRanking(
    user.schoolId!,
    periodId,
    rankingDeptId
  );

  // Also compute school-wide ranking for Principal/Director when viewing a dept
  // (so they can see the dept list AND the school top3 separately).
  let schoolResults = allResults;
  if (canSeeAll && scope === "department") {
    schoolResults = await computeTeacherRanking(user.schoolId!, periodId, undefined);
  }

  const top3 = allResults.slice(0, 3);
  const schoolTop3 = schoolResults.slice(0, 3);

  // ---- Own row -------------------------------------------------------------
  const ownRow = actor.teacher
    ? allResults.find((r) => r.teacherId === actor.teacher!.id) ??
      // If teacher isn't in the dept scope, still find their school row
      schoolResults.find((r) => r.teacherId === actor.teacher!.id) ??
      null
    : null;

  // ---- Build fullList based on role + scope --------------------------------
  let fullList: typeof allResults = [];
  if (scope === "department") {
    // Everyone can see the full dept list — teachers see their dept peers
    fullList = allResults;
  } else if (canSeeAll && !isHod) {
    // Principal/Director in school scope → full school list
    fullList = allResults;
  } else if (isHod) {
    // HOD in school scope → their dept list (same as dept scope)
    fullList = allResults;
  }
  // Plain teacher in school scope → fullList stays []

  // ---- Departments list (for tab/switcher, admins only) --------------------
  type DeptStub = { id: string; name: string };
  let departments: DeptStub[] = [];
  if (canSeeAll) {
    departments = await prisma.department.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  // ownDepartmentId — used by client to pre-select the correct dept tab
  const ownDepartmentId: string | null = teacherDeptId ?? hodDeptId ?? null;

  return NextResponse.json({
    scope,
    top3,
    schoolTop3: canSeeAll ? schoolTop3 : undefined,
    fullList,
    ownRow,
    ownDepartmentId,
    departments,
  });
}
