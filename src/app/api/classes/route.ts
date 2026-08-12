import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { requirePermission, requireRecordsPermission, requireSchoolPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  // Records users need class names for the class/stream filters.
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view")) ??
    (await requireRecordsPermission("RECORDS_DISCIPLINE", "view")) ??
    (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use a lean select instead of include — avoids loading extra join rows.
  // _count.students is an aggregate field, not a full join, so it's cheap.
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      form: true,
      stream: true,
      classTeacherId: true,
      frameworkType: true,
      schoolId: true,
      updatedAt: true,
      classTeacher: { select: { id: true, fullName: true } },
      _count: { select: { students: true } },
    },
  });

  // ETag based on the number of classes + their latest updatedAt — classes
  // rarely change so most requests return 304 after the first load.
  const latest  = classes.reduce((m, c) => Math.max(m, c.updatedAt.getTime()), 0);
  const etag    = `"cls-${classes.length}-${latest}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=60" },
    });
  }

  return NextResponse.json(classes, {
    headers: { ETag: etag, "Cache-Control": "private, max-age=60" },
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters, e.g. Form 3."),
  // form is auto-derived from the class name on the client; accept any positive int
  form: z.number().int().min(1).optional().default(1),
  stream: z.string().trim().optional().or(z.literal("")),
  classTeacherId: z.string().nullable().optional(),
  frameworkType: z.enum(["EIGHT_FOUR_FOUR", "CBC", "CBE"]).optional().default("EIGHT_FOUR_FOUR"),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.classTeacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: parsed.data.classTeacherId, schoolId: user.schoolId! },
    });
    if (!teacher) return NextResponse.json({ error: "Choose a valid teacher." }, { status: 400 });
  }

  try {
    const schoolClass = await (prisma as any).schoolClass.create({ // eslint-disable-line @typescript-eslint/no-explicit-any
      data: {
        schoolId: user.schoolId!,
        name:          parsed.data.name,
        form:          parsed.data.form,
        stream:        parsed.data.stream || null,
        classTeacherId: parsed.data.classTeacherId || null,
        frameworkType: parsed.data.frameworkType,
      },
    });
    return NextResponse.json(schoolClass, { status: 201 });
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === "P2002") {
      const field = err.meta?.target?.[0];
      return NextResponse.json(
        {
          error:
            field === "classTeacherId"
              ? "That teacher is already the class teacher of another class."
              : "A class with that name already exists.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create class." }, { status: 500 });
  }
}
