/**
 * POST /api/school/upload
 *
 * Uploads a school logo or stamp to Supabase Storage (images bucket).
 * field = "logo" | "stamp"
 *
 * Storage path: {schoolId}/school/{field}/{timestamp}.{ext}
 * The resolved public URL is stored on School.logoUrl / School.stampUrl.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole , requireSchoolRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_TYPES  = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const BUCKET         = process.env.SUPABASE_STORAGE_IMAGES_BUCKET ?? "images";

const VALID_FIELDS = ["logo", "stamp"] as const;

const EXT_MAP: Record<string, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/jpg":     "jpg",
  "image/webp":    "webp",
  "image/svg+xml": "svg",
};

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data." }, { status: 400 }); }

  const file  = formData.get("file")  as File   | null;
  const field = formData.get("field") as string | null;

  if (!file || !(file instanceof File))
    return NextResponse.json({ error: "No file provided." }, { status: 400 });

  if (!field || !(VALID_FIELDS as readonly string[]).includes(field))
    return NextResponse.json({ error: "Invalid field. Must be 'logo' or 'stamp'." }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPG, WebP, or SVG." },
      { status: 400 }
    );

  if (file.size > MAX_SIZE_BYTES)
    return NextResponse.json({ error: "File too large. Max 2 MB." }, { status: 400 });

  const ext         = EXT_MAP[file.type] ?? "png";
  const storagePath = `${schoolId}/school/${field}/${Date.now()}.${ext}`;
  const buffer      = Buffer.from(await file.arrayBuffer());
  const supabase    = createAdminClient();

  // Delete old file — read current URL to derive old path.
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { logoUrl: true, stampUrl: true },
  });

  // Old storage paths follow the same naming convention — derive from URL.
  // If the URL contains our bucket path prefix, extract and remove it.
  const oldUrl        = field === "logo" ? school?.logoUrl : school?.stampUrl;
  const bucketPrefix  = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  if (oldUrl?.startsWith(bucketPrefix)) {
    const oldPath = oldUrl.replace(bucketPrefix, "");
    await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) {
    console.error("[school-upload] Supabase error:", uploadErr);
    return NextResponse.json({ error: "Failed to save the file. Please try again." }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const url               = urlData.publicUrl;

  await prisma.school.update({
    where: { id: schoolId },
    data:  field === "logo" ? { logoUrl: url } : { stampUrl: url },
  });

  return NextResponse.json({ url });
}
