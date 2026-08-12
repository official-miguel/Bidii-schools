/**
 * POST /api/me/photo  — upload the current user's profile photo to Supabase Storage.
 * DELETE /api/me/photo — remove the current user's profile photo.
 *
 * Storage: Supabase `images` bucket, path {schoolId}/{userId}/{timestamp}.{ext}
 * The resolved public URL is stored in User.avatarUrl for fast reads.
 * The raw storage path is stored in User.avatarStoragePath for deletes/replacements.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const BUCKET = process.env.SUPABASE_STORAGE_IMAGES_BUCKET ?? "images";

// ── POST /api/me/photo ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const ext          = extMap[file.type] ?? "jpg";
  const storagePath  = `${user.schoolId!}/${user.id}/${Date.now()}.${ext}`;
  const buffer       = Buffer.from(await file.arrayBuffer());
  const supabase     = createAdminClient();

  // Delete the previous photo if one exists.
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarStoragePath: true },
  });
  if (current?.avatarStoragePath) {
    await supabase.storage.from(BUCKET).remove([current.avatarStoragePath]).catch(() => {});
  }

  // Upload new photo.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) {
    console.error("[avatar] Supabase upload error:", uploadErr);
    return NextResponse.json({ error: "Failed to save photo. Please try again." }, { status: 500 });
  }

  // Resolve the public URL for fast display (bucket is public-read).
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const url = urlData.publicUrl;

  await prisma.user.update({
    where: { id: user.id },
    data:  { avatarUrl: url, avatarStoragePath: storagePath },
  });

  return NextResponse.json({ url });
}

// ── DELETE /api/me/photo ──────────────────────────────────────────────────────

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarStoragePath: true },
  });

  if (current?.avatarStoragePath) {
    const supabase = createAdminClient();
    await supabase.storage.from(BUCKET).remove([current.avatarStoragePath]).catch(() => {});
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { avatarUrl: null, avatarStoragePath: null },
  });

  return NextResponse.json({ ok: true });
}
