import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireRecordsPermission, requireSchoolPermission } from "@/lib/permissions";
import { getStageByName } from "@/lib/curriculum/stageCatalog";
import type { FrameworkType } from "@prisma/client";

export async function GET(req: NextRequest) {
  // Records users need class names for the class/stream filters.
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view")) ??
    (await requireRecordsPermission("RECORDS_DISCIPLINE", "view")) ??
    (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      form: true,
      stream: true,
      streamId: true,
      stageName: true,
      classTeacherId: true,
      frameworkType: true,
      schoolId: true,
      updatedAt: true,
      promotesToClassId: true,
      confirmedTerminal: true,
      resetTeachersOnPromotion: true,
      skipStageConfirmed: true,
      classTeacher: { select: { id: true, fullName: true } },
      _count: { select: { students: true } },
    },
  });

  const latest = classes.reduce((m, c) => Math.max(m, c.updatedAt.getTime()), 0);
  const etag   = `"cls-${classes.length}-${latest}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }

  return NextResponse.json(classes, {
    headers: { ETag: etag, "Cache-Control": "private, no-cache" },
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters, e.g. Form 3."),
  /** Legacy free-typed form number — accepted but overridden when stageName is given. */
  form: z.number().int().min(1).optional().default(1),
  /** Canonical stage name picked from STAGE_CATALOG dropdown in the UI. */
  stageName: z.string().trim().optional(),
  /** Structured stream FK (optional). */
  streamId: z.string().optional().nullable(),
  /** Legacy free-text stream — kept for backward compat. */
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

  const framework = parsed.data.frameworkType as FrameworkType;

  // Derive form (rank) from stageName if provided; otherwise keep the
  // supplied form integer (legacy path).
  let derivedForm = parsed.data.form;
  let derivedStageName: string | null = parsed.data.stageName ?? null;

  if (parsed.data.stageName) {
    const entry = getStageByName(framework, parsed.data.stageName);
    if (!entry) {
      return NextResponse.json(
        { error: `"${parsed.data.stageName}" is not a valid stage for ${framework}.` },
        { status: 400 }
      );
    }
    derivedForm      = entry.rank;
    derivedStageName = entry.name;
  }

  if (parsed.data.classTeacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: parsed.data.classTeacherId, schoolId: user.schoolId! },
    });
    if (!teacher) return NextResponse.json({ error: "Choose a valid teacher." }, { status: 400 });
  }

  if (parsed.data.streamId) {
    const stream = await prisma.stream.findFirst({
      where: { id: parsed.data.streamId, schoolId: user.schoolId! },
    });
    if (!stream) return NextResponse.json({ error: "Choose a valid stream." }, { status: 400 });
  }

  try {
    const schoolClass = await prisma.schoolClass.create({
      data: {
        schoolId:       user.schoolId!,
        name:           parsed.data.name,
        form:           derivedForm,
        stageName:      derivedStageName,
        stream:         parsed.data.stream || null,
        streamId:       parsed.data.streamId ?? null,
        classTeacherId: parsed.data.classTeacherId || null,
        frameworkType:  framework,
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
