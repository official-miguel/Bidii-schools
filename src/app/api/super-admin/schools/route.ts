import { NextRequest, NextResponse } from "next/server";
import { z }                     from "zod";
import { prisma }                from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import { hashPassword } from "@/lib/auth";

const CreateSchema = z.object({
  name:          z.string().min(2),
  address:       z.string().optional(),
  contactPerson: z.string().min(1),
  contactEmail:  z.string().email(),
  contactPhone:  z.string().optional(),
  planTier:      z.enum(["FREE","STARTER","GROWTH","PROFESSIONAL","ENTERPRISE"]).default("STARTER"),
  storageQuotaGb: z.number().min(1).default(10),
  slug:          z.string().regex(/^[a-z0-9-]+$/).optional(),
  adminName:     z.string().min(1),
  adminEmail:    z.string().email(),
  tempPassword:  z.string().min(8),
});

/** GET /api/super-admin/schools — paginated list with meta join */
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const q      = sp.get("q")?.trim() ?? "";
  const status = sp.get("status") ?? undefined;
  const sortBy = sp.get("sortBy") ?? "name";
  const sortDir = (sp.get("sortDir") ?? "asc") as "asc" | "desc";
  const page   = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit  = 50;
  const skip   = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (q) where.name = { contains: q, mode: "insensitive" };

  const schools = await prisma.school.findMany({
    where,
    orderBy: sortBy === "name" ? { name: sortDir } : { createdAt: sortDir },
    skip,
    take: limit,
    select: {
      id: true, name: true, createdAt: true, email: true,
      schoolMeta: {
        select: {
          planTier: true, status: true, storageQuotaGb: true,
          studentCount: true, staffCount: true, contactPerson: true, contactEmail: true,
        },
      },
      _count: { select: { students: true, teachers: true } },
      storageUsages: { select: { sizeBytes: true } },
    },
  });

  const filtered = status
    ? schools.filter(s => s.schoolMeta?.status === status)
    : schools;

  const total = await prisma.school.count({ where });

  return NextResponse.json({ schools: filtered, total, page, limit });
}

/** POST /api/super-admin/schools — create a new school + first admin */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;
  const slug = d.slug ?? d.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // Check slug uniqueness
  const existing = await prisma.schoolMeta.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "Slug already taken" }, { status: 409 });

  const passwordHash = await hashPassword(d.tempPassword);

  const school = await prisma.$transaction(async (tx) => {
    const s = await tx.school.create({
      data: {
        name:    d.name,
        address: d.address,
        email:   d.contactEmail,
        slug,
        schoolMeta: {
          create: {
            planTier:       d.planTier,
            status:         "ONBOARDING",
            storageQuotaGb: d.storageQuotaGb,
            slug,
            contactPerson:  d.contactPerson,
            contactEmail:   d.contactEmail,
            contactPhone:   d.contactPhone,
          },
        },
      },
    });

    await tx.user.create({
      data: {
        email:             d.adminEmail,
        passwordHash,
        role:              "PRINCIPAL",
        mustChangePassword: true,
        schoolId:          s.id,
      },
    });

    return s;
  });

  await logAudit(user.id, "SCHOOL_CREATED", "school", school.id, {
    name: d.name, planTier: d.planTier,
  });

  return NextResponse.json({ school }, { status: 201 });
}
