import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET() {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.messagingSettings.findUnique({
    where: { schoolId: user.schoolId! },
  });

  return NextResponse.json(settings ?? {
    schoolId: user.schoolId!,
    resultsClosing: "Thank you for your continued support.",
    batchSize:      50,
  });
}

const updateSchema = z.object({
  resultsClosing: z.string().trim().min(1).optional(),
  batchSize:      z.number().int().min(1).max(200).optional(),
});

export async function PUT(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const settings = await prisma.messagingSettings.upsert({
    where:  { schoolId: user.schoolId! },
    update: parsed.data,
    create: {
      schoolId: user.schoolId!,
      resultsClosing: parsed.data.resultsClosing ?? "Thank you for your continued support.",
      batchSize:      parsed.data.batchSize      ?? 50,
    },
  });

  return NextResponse.json(settings);
}
