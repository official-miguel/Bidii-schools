/**
 * POST   /api/students/[id]/photo — upload a student profile photo.
 * DELETE /api/students/[id]/photo — remove a student profile photo.
 *
 * Storage: Supabase `images` bucket, path {schoolId}/students/{studentId}/{timestamp}.{ext}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_TYPES  = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const BUCKET         = process.env.SUPABASE_STORAGE_IMAGES_BUCKET ?? "images";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId!, archivedAt: null },
    select: { id: true, photoStoragePath: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data." }, { status: 400 }); }

  const file = formData.get("photo") as File | null;
  if (!file || !(file instanceof File))
    return NextResponse.json({ error: "No photo provided." }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPG, or WebP." },
      { status: 400 }
    );

  if (file.size > MAX_SIZE_BYTES)
    return NextResponse.json({ error: "File too large. Max 2 MB." }, { status: 400 });

  const extMap: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg",
    "image/jpg": "jpg",  "image/webp": "webp",
  };
  const ext         = extMap[file.type] ?? "jpg";
  const storagePath = `${user.schoolId!}/students/${params.id}/${Date.now()}.${ext}`;
  const buffer      = Buffer.from(await file.arrayBuffer());
  const supabase    = createAdminClient();

  // Remove previous photo if one exists.
  if (student.photoStoragePath) {
    await supabase.storage.from(BUCKET).remove([student.photoStoragePath]).catch(() => {});
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) {
    console.error("[student-photo] Supabase upload error:", uploadErr);
    return NextResponse.json({ error: "Failed to save photo. Please try again." }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const url = urlData.publicUrl;

  await prisma.student.update({
    where: { id: params.id },
    data:  { photoUrl: url, photoStoragePath: storagePath },
  });

  return NextResponse.json({ url });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId!, archivedAt: null },
    select: { id: true, photoStoragePath: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  if (student.photoStoragePath) {
    const supabase = createAdminClient();
    await supabase.storage.from(BUCKET).remove([student.photoStoragePath]).catch(() => {});
  }

  await prisma.student.update({
    where: { id: params.id },
    data:  { photoUrl: null, photoStoragePath: null },
  });

  return NextResponse.json({ ok: true });
}
