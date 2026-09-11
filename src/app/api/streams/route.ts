import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/streams
// Lists all streams for the school. Classes members and staff with CLASSES
// view access can call this (needed for the promotion mapping dropdowns).
// ---------------------------------------------------------------------------
export async function GET() {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("CLASSES", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const streams = await prisma.stream.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { classes: true } },
    },
  });

  return NextResponse.json(streams);
}

// ---------------------------------------------------------------------------
// POST /api/streams
// Creates a new stream. Principal-only.
// ---------------------------------------------------------------------------
const createSchema = z.object({
  name: z.string().trim().min(1, "Stream name is required.").max(50),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const stream = await prisma.stream.create({
      data: { schoolId: user.schoolId, name: parsed.data.name },
    });
    return NextResponse.json(stream, { status: 201 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: `A stream named "${parsed.data.name}" already exists.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create stream." }, { status: 500 });
  }
}
