import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";
import { summarizeDisciplineFile } from "@/lib/ai/recordsSummary";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const AI_CAPABLE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: { student: { select: { id: true, fullName: true } } },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file to upload." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Files must be 8 MB or smaller." }, { status: 400 });
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json({ error: "Only images, PDFs, and Word documents are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const duplicate = await prisma.studentFile.findUnique({
    where: { studentId_sha256: { studentId: record.studentId, sha256 } },
    select: { id: true, disciplineRecordId: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "This file has already been uploaded for this student." }, { status: 409 });
  }

  let created;
  try {
    created = await prisma.studentFile.create({
      data: {
        schoolId: user.schoolId!,
        studentId: record.studentId,
        disciplineRecordId: record.id,
        fileName: file.name.slice(0, 200) || "upload",
        mimeType,
        size: file.size,
        sha256,
        data: buffer,
        uploadedById: user.id,
      },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    });
    await prisma.disciplineEvent.create({
      data: {
        disciplineRecordId: record.id,
        type: "FILE",
        detail: `File attached: ${created.fileName}`,
        createdById: user.id,
      },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't save the file." }, { status: 500 });
  }

  // AI summary only after a successful upload; cached on the record and never
  // allowed to fail the upload itself.
  let aiSummary: string | null = null;
  if (AI_CAPABLE.has(mimeType)) {
    aiSummary = await summarizeDisciplineFile(
      user.schoolId!,
      { mimeType, base64: buffer.toString("base64") },
      { studentName: record.student.fullName, offence: record.offence }
    );
    if (aiSummary) {
      await prisma.disciplineRecord.update({
        where: { id: record.id },
        data: { aiSummary },
      });
      await prisma.disciplineEvent.create({
        data: { disciplineRecordId: record.id, type: "AI_SUMMARY", detail: aiSummary, createdById: user.id },
      });
    }
  }

  return NextResponse.json({ file: created, aiSummary }, { status: 201 });
}
