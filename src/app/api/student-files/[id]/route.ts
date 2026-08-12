import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = (await requireRecordsPermission("RECORDS_DISCIPLINE", "view")) ?? (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.studentFile.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${file.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = (await requireRecordsPermission("RECORDS_DISCIPLINE", "manage")) ?? (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 200) : "";
  if (!fileName) return NextResponse.json({ error: "Enter a file name." }, { status: 400 });

  const file = await prisma.studentFile.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const updated = await prisma.studentFile.update({
    where: { id: file.id },
    data: { fileName },
    select: { id: true, fileName: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = (await requireRecordsPermission("RECORDS_DISCIPLINE", "manage")) ?? (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.studentFile.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  try {
    await prisma.studentFile.delete({ where: { id: file.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the file." }, { status: 500 });
  }
}
