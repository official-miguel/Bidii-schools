import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { summarizeAchievement } from "@/lib/ai/recordsSummary";

const categoryEnum = z.enum(["SPORTS", "LEADERSHIP", "MUSIC_FESTIVAL", "ACADEMICS", "INNOVATION", "OTHER"]);

const createSchema = z.object({
  title: z.string().trim().min(2, "Enter a title."),
  category: categoryEnum,
  description: z.string().trim().optional().or(z.literal("")),
  achievementDate: z.string().min(1, "Enter the achievement date."),
  awardLevel: z.string().trim().optional().or(z.literal("")),
  studentIds: z.array(z.string()).min(1, "Select at least one student."),
});

export async function GET(req: NextRequest) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
  const achievements = await prisma.achievement.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(studentId ? { students: { some: { studentId } } } : {}),
    },
    orderBy: { achievementDate: "desc" },
    include: {
      students: {
        include: { student: { select: { id: true, fullName: true, admissionNumber: true, schoolClass: { select: { id: true, name: true, form: true, stream: true } } } } },
      },
      recordedBy: { select: { email: true } },
    },
  });
  return NextResponse.json(achievements);
}

export async function POST(req: NextRequest) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const count = await prisma.student.count({
    where: { id: { in: d.studentIds }, schoolId: user.schoolId! },
  });
  if (count !== d.studentIds.length) {
    return NextResponse.json({ error: "Choose valid students." }, { status: 400 });
  }

  // AI summary is generated once at creation and cached on the record.
  const aiSummary = await summarizeAchievement(user.schoolId!, {
    title: d.title,
    description: d.description || null,
    category: d.category,
    awardLevel: d.awardLevel || null,
  });

  try {
    const achievement = await prisma.achievement.create({
      data: {
        schoolId: user.schoolId!,
        title: d.title,
        category: d.category,
        description: d.description || null,
        achievementDate: new Date(d.achievementDate),
        awardLevel: d.awardLevel || null,
        aiSummary,
        recordedById: user.id,
        students: { create: d.studentIds.map((studentId) => ({ studentId })) },
      },
      include: {
        students: { include: { student: { select: { id: true, fullName: true, admissionNumber: true } } } },
      },
    });
    return NextResponse.json(achievement, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't record the achievement." }, { status: 500 });
  }
}
