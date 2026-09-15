/**
 * /api/super-admin/modules — per-school module switches.
 *
 * Three modules are optional and can be switched on or off per school:
 * Library, Finance, and Accommodation. Everything else is core and ships with
 * every school, so there is nothing to configure and no plan or billing tier
 * involved — a module is either on for a school or it is not.
 *
 * Switching one off removes it from that school entirely: it disappears from
 * every dashboard and sidebar, and its pages and API routes answer 404. The
 * school's existing data is left untouched and returns intact if it is
 * switched back on.
 */

import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import {
  OPTIONAL_MODULES,
  OPTIONAL_MODULE_LABEL,
  OPTIONAL_MODULE_DESCRIPTION,
  TOGGLEABLE_SYSTEM_MODULES,
  toSystemModule,
  type OptionalModule,
} from "@/lib/moduleAccess";

/** GET /api/super-admin/modules — every school with its three switches */
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [schools, toggles] = await Promise.all([
    prisma.school.findMany({
      select: { id: true, name: true, schoolMeta: { select: { status: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.schoolModuleToggle.findMany({
      where:  { module: { in: TOGGLEABLE_SYSTEM_MODULES } },
      select: { schoolId: true, module: true, enabled: true, updatedAt: true },
    }),
  ]);

  return NextResponse.json({
    schools,
    toggles,
    // The catalogue the UI renders — labels live server-side so the page and
    // the enforcement layer can never drift apart.
    modules: OPTIONAL_MODULES.map((m) => ({
      id:          m,
      systemModule: toSystemModule(m),
      label:       OPTIONAL_MODULE_LABEL[m],
      description: OPTIONAL_MODULE_DESCRIPTION[m],
    })),
  });
}

const ToggleSchema = z.object({
  schoolId: z.string().min(1),
  module:   z.enum(OPTIONAL_MODULES),
  enabled:  z.boolean(),
});

/** POST /api/super-admin/modules — switch one module on or off for one school */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { schoolId, enabled } = parsed.data;
  const module: OptionalModule = parsed.data.module;
  const systemModule = toSystemModule(module);

  const school = await prisma.school.findUnique({
    where:  { id: schoolId },
    select: { id: true },
  });
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const toggle = await prisma.schoolModuleToggle.upsert({
    where:  { schoolId_module: { schoolId, module: systemModule } },
    create: { schoolId, module: systemModule, enabled, updatedBy: user.id },
    update: { enabled, updatedBy: user.id },
  });

  await logAudit(user.id, "MODULE_TOGGLED", "school", schoolId, {
    module,
    label: OPTIONAL_MODULE_LABEL[module],
    enabled,
  });

  return NextResponse.json({ toggle });
}
