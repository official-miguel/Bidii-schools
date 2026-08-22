import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";

/** GET /api/super-admin/imports — import job history */
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const schoolId = sp.get("schoolId") ?? undefined;
  const status   = sp.get("status")   ?? undefined;
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit    = 50;
  const skip     = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (schoolId) where.schoolId = schoolId;
  if (status)   where.status   = status;

  const [jobs, total] = await Promise.all([
    prisma.importJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { school: { select: { name: true } } },
    }),
    prisma.importJob.count({ where }),
  ]);

  return NextResponse.json({ jobs, total, page, limit });
}

const CreateSchema = z.object({
  schoolId:  z.string(),
  type:      z.enum([
    // Section 1 — School Setup
    "DEPARTMENTS","CLASSES","SUBJECTS",
    // Section 2 — Staff
    "STAFF",
    // Section 3 — Students
    "STUDENTS","STUDENT_DORM",
    // Section 4 — Parents
    "PARENTS",
    // Section 5 — Finance
    "STUDENT_OPENING_BALANCE",
    // Legacy / combined
    "BOTH","CUSTOM","DORM_SETUP","DORMITORIES","BEDS","ALLOCATIONS",
  ]),
  fileName:  z.string(),
  totalRows: z.number().int().min(0),
});

/** POST /api/super-admin/imports — create an import job record */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const rollbackAt = new Date(Date.now() + 24 * 3600_000); // 24h window

  const job = await prisma.importJob.create({
    data: {
      ...parsed.data,
      status:     "QUEUED",
      createdBy:  user.id,
      rollbackAt,
    },
  });

  await logAudit(user.id, "IMPORT_STARTED", "school", parsed.data.schoolId, {
    jobId: job.id, type: parsed.data.type, fileName: parsed.data.fileName,
  });

  return NextResponse.json({ job }, { status: 201 });
}
