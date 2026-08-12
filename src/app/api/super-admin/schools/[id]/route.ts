import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";

const UpdateSchema = z.object({
  planTier: z.enum(["FREE","STARTER","GROWTH","PROFESSIONAL","ENTERPRISE"]).optional(),
  status:   z.enum(["ONBOARDING","ACTIVE","SUSPENDED"]).optional(),
  storageQuotaGb: z.number().min(1).optional(),
});

/** GET /api/super-admin/schools/[id] — full school detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const school = await prisma.school.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, address: true, email: true, phone: true,
      createdAt: true, updatedAt: true,
      schoolMeta: true,
      _count: { select: { students: true, teachers: true, users: true } },
      schoolModuleToggles: { orderBy: { module: "asc" } },
      systemErrors: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, message: true, severity: true, status: true,
                  module: true, occurrences: true, createdAt: true },
      },
      storageUsages: {
        orderBy: { recordedAt: "desc" },
        take: 50,
        select: { id: true, type: true, sizeBytes: true, recordedAt: true },
      },
      importJobs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, fileName: true, status: true,
                  totalRows: true, succeeded: true, failed: true, createdAt: true },
      },
    },
  });

  if (!school) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ school });
}

/** PATCH /api/super-admin/schools/[id] — update plan tier or status */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { planTier, status, storageQuotaGb } = parsed.data;

  const updated = await prisma.schoolMeta.update({
    where: { schoolId: params.id },
    data:  { planTier, status, storageQuotaGb },
  });

  const action = status === "SUSPENDED" ? "SCHOOL_SUSPENDED"
               : status === "ACTIVE"    ? "SCHOOL_REACTIVATED"
               : "SCHOOL_UPDATED";

  await logAudit(user.id, action, "school", params.id, parsed.data);

  return NextResponse.json({ meta: updated });
}
