import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { summarizeAchievement } from "@/lib/ai/recordsSummary";

const schema = z.object({
  /// When provided, the user hand-edited the summary — save as-is, no AI call.
  aiSummary: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const achievement = await prisma.achievement.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!achievement) return NextResponse.json({ error: "Achievement not found." }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  let aiSummary: string | null;
  if (parsed.data.aiSummary !== undefined) {
    aiSummary = parsed.data.aiSummary || null;
  } else {
    aiSummary = await summarizeAchievement(user.schoolId!, {
      title: achievement.title,
      description: achievement.description,
      category: achievement.category,
      awardLevel: achievement.awardLevel,
    });
    if (!aiSummary) {
      return NextResponse.json({ error: "The AI is temporarily unavailable." }, { status: 502 });
    }
  }

  await prisma.achievement.update({ where: { id: achievement.id }, data: { aiSummary } });
  return NextResponse.json({ aiSummary, generatedAt: new Date().toISOString() });
}
