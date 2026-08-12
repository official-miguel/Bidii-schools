import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { callGemini } from "@/lib/ai/gemini";

const schema = z.object({
  /// When provided, the user hand-edited the summary — save as-is, no AI call.
  aiSummary: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: { student: { select: { fullName: true } } },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  let aiSummary: string | null;
  if (parsed.data.aiSummary !== undefined) {
    aiSummary = parsed.data.aiSummary || null;
  } else {
    try {
      const text = await callGemini(
        user.schoolId!,
        `School discipline case for student ${record.student.fullName}.\nOffence: ${record.offence}\nDescription: ${record.description || "—"}\nAction taken: ${record.actionTaken || "—"}\n\nWrite ONE very short plain-text summary sentence, e.g. "Found vaping." No markdown, no preamble.`,
        { temperature: 0.2, timeoutMs: 20000, cacheTtlMs: 0 }
      );
      aiSummary = text.trim().slice(0, 300) || null;
    } catch (e) {
      const err = e as { message?: string };
      return NextResponse.json(
        { error: err?.message || "The AI is temporarily unavailable." },
        { status: 502 }
      );
    }
  }

  await prisma.disciplineRecord.update({ where: { id: record.id }, data: { aiSummary } });
  if (aiSummary) {
    await prisma.disciplineEvent.create({
      data: {
        disciplineRecordId: record.id,
        type: "AI_SUMMARY",
        detail: aiSummary,
        createdById: user.id,
      },
    });
  }
  return NextResponse.json({ aiSummary, generatedAt: new Date().toISOString() });
}
