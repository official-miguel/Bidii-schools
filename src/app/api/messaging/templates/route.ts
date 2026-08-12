import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET() {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.messageTemplate.findMany({
    where:   { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(templates);
}

const createSchema = z.object({
  name:     z.string().trim().min(2, "Name must be at least 2 characters."),
  category: z.string().trim().optional().or(z.literal("")),
  body:     z.string().trim().min(1, "Template body cannot be empty."),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const template = await prisma.messageTemplate.create({
      data: {
        schoolId: user.schoolId!,
        name:     parsed.data.name,
        category: parsed.data.category || null,
        body:     parsed.data.body,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A template with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create template." }, { status: 500 });
  }
}
