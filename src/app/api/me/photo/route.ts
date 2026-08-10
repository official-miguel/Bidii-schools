import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

async function storeAvatar(userId: string, file: File, ext: string): Promise<string> {
  const filename = `${userId}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/avatars/${filename}`;
}

async function deleteOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return;
  await unlink(path.join(process.cwd(), "public", avatarUrl)).catch(() => {});
}

// ── POST /api/me/photo ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

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
    "image/jpg": "jpg", "image/webp": "webp",
  };
  const ext = extMap[file.type] ?? "jpg";

  let url: string;
  try {
    url = await storeAvatar(user.id, file, ext);
  } catch (err) {
    console.error("[avatar] storage error:", err);
    return NextResponse.json({ error: "Failed to save photo. Please try again." }, { status: 500 });
  }

  // Fetch current avatarUrl to delete old file
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarUrl: true },
  });
  await deleteOldAvatar(current?.avatarUrl ?? null);

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });

  return NextResponse.json({ url });
}

// ── DELETE /api/me/photo ───────────────────────────────────────────────────

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarUrl: true },
  });
  await deleteOldAvatar(current?.avatarUrl ?? null);
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });

  return NextResponse.json({ ok: true });
}
