import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

// ── Storage ────────────────────────────────────────────────────────────────────
// Photos written to public/uploads/students/<studentId>.<ext>
// so the URL is a relative path served directly by Next.js.

async function storePhoto(studentId: string, file: File, ext: string): Promise<string> {
  const filename = `${studentId}.${ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "students");
  await mkdir(uploadsDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/students/${filename}`;
}

async function deleteOldPhoto(photoUrl: string | null) {
  if (!photoUrl || !photoUrl.startsWith("/uploads/students/")) return;
  const filePath = path.join(process.cwd(), "public", photoUrl);
  await unlink(filePath).catch(() => {
    // Non-fatal — file may already be gone
  });
}

// ── POST /api/students/[id]/photo ──────────────────────────────────────────────
// Accepts multipart/form-data with a single "photo" file field.
// Returns { url } on success.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the student belongs to this school
  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, archivedAt: null },
    select: { id: true, photoUrl: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("photo") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PNG, JPG, or WebP image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 2 MB." },
      { status: 400 }
    );
  }

  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
  };
  const ext = extMap[file.type] ?? "jpg";

  let url: string;
  try {
    url = await storePhoto(params.id, file, ext);
  } catch (err) {
    console.error("[student-photo] storage error:", err);
    return NextResponse.json({ error: "Failed to save photo. Please try again." }, { status: 500 });
  }

  // Delete the previous photo file if it existed
  await deleteOldPhoto(student.photoUrl);

  await prisma.student.update({
    where: { id: params.id },
    data: { photoUrl: url },
  });

  return NextResponse.json({ url });
}

// ── DELETE /api/students/[id]/photo ───────────────────────────────────────────
// Removes the photo and clears photoUrl.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, archivedAt: null },
    select: { id: true, photoUrl: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  await deleteOldPhoto(student.photoUrl);
  await prisma.student.update({
    where: { id: params.id },
    data: { photoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
