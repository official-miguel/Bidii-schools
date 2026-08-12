import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";

/** Module dependency map — key cannot be enabled unless all values are enabled */
export const MODULE_DEPS: Record<string, string[]> = {
  GRADING:        ["ATTENDANCE"],
  REPORTS:        ["GRADING"],
  IMPORT_TOOL:    [],
  LIBRARY:        [],
  TRANSPORT:      [],
  MESSAGING:      [],
  FEE_MANAGEMENT: [],
  TIMETABLE:      [],
  ACCOMMODATION:  [],
  ANALYTICS:      ["GRADING"],
  AI_TOOLS:       ["GRADING"],
  ATTENDANCE:     [],
};

/** Plan tier → default module set */
export const PLAN_BUNDLES: Record<string, string[]> = {
  FREE:         ["ATTENDANCE"],
  STARTER:      ["ATTENDANCE", "GRADING", "REPORTS", "IMPORT_TOOL"],
  GROWTH:       ["ATTENDANCE", "GRADING", "REPORTS", "IMPORT_TOOL", "MESSAGING", "LIBRARY", "TIMETABLE"],
  PROFESSIONAL: ["ATTENDANCE", "GRADING", "REPORTS", "IMPORT_TOOL", "MESSAGING", "LIBRARY",
                 "TIMETABLE", "FEE_MANAGEMENT", "ACCOMMODATION", "ANALYTICS"],
  ENTERPRISE:   Object.keys({ ATTENDANCE:1,GRADING:1,REPORTS:1,IMPORT_TOOL:1,MESSAGING:1,
                               LIBRARY:1,TIMETABLE:1,FEE_MANAGEMENT:1,ACCOMMODATION:1,
                               ANALYTICS:1,AI_TOOLS:1,TRANSPORT:1 }),
};

/** GET /api/super-admin/modules — grid data: all schools × all modules */
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [schools, toggles] = await Promise.all([
    prisma.school.findMany({
      select: { id: true, name: true, schoolMeta: { select: { planTier: true, status: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.schoolModuleToggle.findMany(),
  ]);

  return NextResponse.json({ schools, toggles, deps: MODULE_DEPS, bundles: PLAN_BUNDLES });
}

const ToggleSchema = z.object({
  schoolId: z.string(),
  module:   z.string(),
  enabled:  z.boolean(),
});

/** POST /api/super-admin/modules — toggle a module for a school */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { schoolId, module, enabled } = parsed.data;

  // Dependency check when enabling
  if (enabled) {
    const deps = MODULE_DEPS[module] ?? [];
    if (deps.length > 0) {
      const existing = await prisma.schoolModuleToggle.findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: { schoolId, module: { in: deps as any }, enabled: true },
      });
      const missing = deps.filter(d => !existing.some(e => e.module === d));
      if (missing.length > 0) {
        return NextResponse.json({ error: `Missing required modules: ${missing.join(", ")}` }, { status: 422 });
      }
    }
  }

  const toggle = await prisma.schoolModuleToggle.upsert({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where:  { schoolId_module: { schoolId, module: module as any } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: { schoolId, module: module as any, enabled, updatedBy: user.id },
    update: { enabled, updatedBy: user.id },
  });

  await logAudit(user.id, "MODULE_TOGGLED", "school", schoolId, { module, enabled });

  return NextResponse.json({ toggle });
}
