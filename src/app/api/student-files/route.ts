import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB — same limit as discipline uploads
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function GET(req: NextRequest) {
  const user = (await requireRecordsPermission("RECORDS_DISCIPLINE", "view")) ?? (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const files = await prisma.studentFile.findMany({
    where: { studentId, schoolId: user.schoolId! },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      disciplineRecordId: true,
      disciplineRecord: { select: { offence: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(files);
}

/// General (non-case) file upload to a student's profile — the Files tab's
/// "Upload file". Discipline evidence keeps going through
/// /api/discipline/[id]/files so it stays linked to the case + AI summary.
export async function POST(req: NextRequest) {
  const user =
    (await requireRecordsPermission("RECORDS_DISCIPLINE", "manage")) ??
    (await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const studentId = String(form?.get("studentId") || "");
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });
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

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const duplicate = await prisma.studentFile.findUnique({
    where: { studentId_sha256: { studentId: student.id, sha256 } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "This file has already been uploaded for this student." }, { status: 409 });
  }

  try {
    const created = await prisma.studentFile.create({
      data: {
        schoolId: user.schoolId!,
        studentId: student.id,
        fileName: file.name.slice(0, 200) || "upload",
        mimeType,
        size: file.size,
        sha256,
        data: buffer,
        uploadedById: user.id,
      },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    });
    return NextResponse.json({ file: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't save the file." }, { status: 500 });
  }
}
