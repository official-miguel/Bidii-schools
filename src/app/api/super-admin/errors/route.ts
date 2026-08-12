import { NextRequest, NextResponse } from "next/server";
import { z }                          from "zod";
import { prisma }                     from "@/lib/prisma";
import { requireSuperAdmin }          from "@/lib/super-admin";

/** GET /api/super-admin/errors — filterable, paginated error list */
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const schoolId = sp.get("schoolId") ?? undefined;
  const severity = sp.get("severity") ?? undefined;
  const status   = sp.get("status")   ?? undefined;
  const moduleName = sp.get("module")   ?? undefined;
  const from     = sp.get("from")     ?? undefined;
  const to       = sp.get("to")       ?? undefined;
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit    = 50;
  const skip     = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (schoolId) where.schoolId = schoolId;
  if (severity) where.severity = severity;
  if (status)   where.status   = status;
  if (moduleName)   where.module   = { contains: moduleName, mode: "insensitive" };
  if (from || to) {
    where.createdAt = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (from) (where.createdAt as any).gte = new Date(from);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (to)   (where.createdAt as any).lte = new Date(to);
  }

  const [errors, total] = await Promise.all([
    prisma.systemError.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { school: { select: { name: true } } },
    }),
    prisma.systemError.count({ where }),
  ]);

  // Trend data: errors per day (last 14 days) grouped by severity
  const trendRaw = await prisma.systemError.groupBy({
    by: ["severity"],
    where: { createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    _count: { id: true },
  });

  return NextResponse.json({ errors, total, page, limit, trend: trendRaw });
}

const UpdateSchema = z.object({
  status: z.enum(["NEW", "INVESTIGATING", "RESOLVED", "IGNORED"]),
  notes:  z.string().optional(),
});

/** PATCH /api/super-admin/errors — update status/notes for one error */
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updated = await prisma.systemError.update({
    where: { id },
    data:  {
      status:     parsed.data.status,
      notes:      parsed.data.notes,
      resolvedAt: parsed.data.status === "RESOLVED" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ error: updated });
}
