import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { summarizeAchievement } from "@/lib/ai/recordsSummary";

const categoryEnum = z.enum(["SPORTS", "LEADERSHIP", "MUSIC_FESTIVAL", "ACADEMICS", "INNOVATION", "OTHER"]);

const updateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  category: categoryEnum.optional(),
  description: z.string().trim().optional().or(z.literal("")),
  achievementDate: z.string().min(1).optional(),
  awardLevel: z.string().trim().optional().or(z.literal("")),
  studentIds: z.array(z.string()).min(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const existing = await prisma.achievement.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Achievement not found." }, { status: 404 });

  const d = parsed.data;
  if (d.studentIds) {
    const count = await prisma.student.count({
      where: { id: { in: d.studentIds }, schoolId: user.schoolId! },
    });
    if (count !== d.studentIds.length) {
      return NextResponse.json({ error: "Choose valid students." }, { status: 400 });
    }
  }

  // Regenerate the cached AI summary only when content actually changed.
  const contentChanged =
    (d.title !== undefined && d.title !== existing.title) ||
    (d.category !== undefined && d.category !== existing.category) ||
    (d.description !== undefined && (d.description || null) !== existing.description) ||
    (d.awardLevel !== undefined && (d.awardLevel || null) !== existing.awardLevel);

  const aiSummary = contentChanged
    ? await summarizeAchievement(user.schoolId!, {
        title: d.title ?? existing.title,
        description: d.description !== undefined ? d.description || null : existing.description,
        category: d.category ?? existing.category,
        awardLevel: d.awardLevel !== undefined ? d.awardLevel || null : existing.awardLevel,
      })
    : undefined;

  try {
    const achievement = await prisma.$transaction(async (tx) => {
      if (d.studentIds) {
        await tx.achievementStudent.deleteMany({ where: { achievementId: params.id } });
        await tx.achievementStudent.createMany({
          data: d.studentIds.map((studentId) => ({ achievementId: params.id, studentId })),
          skipDuplicates: true,
        });
      }
      return tx.achievement.update({
        where: { id: params.id },
        data: {
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.category !== undefined ? { category: d.category } : {}),
          ...(d.description !== undefined ? { description: d.description || null } : {}),
          ...(d.awardLevel !== undefined ? { awardLevel: d.awardLevel || null } : {}),
          ...(d.achievementDate ? { achievementDate: new Date(d.achievementDate) } : {}),
          ...(aiSummary !== undefined ? { aiSummary } : {}),
        },
        include: {
          students: { include: { student: { select: { id: true, fullName: true, admissionNumber: true } } } },
        },
      });
    });
    return NextResponse.json(achievement);
  } catch {
    return NextResponse.json({ error: "Couldn't update the achievement." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.achievement.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Achievement not found." }, { status: 404 });

  try {
    await prisma.achievement.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the achievement." }, { status: 500 });
  }
}
