/**
 * src/lib/supabase/storage.ts
 *
 * Upload and signed-URL helpers for Supabase Storage.
 *
 * Bucket layout:
 *   images/  — profile avatars, school logos, stamps
 *              Path convention: {schoolId}/{userId}/{filename}
 *              Bucket policy: authenticated users can read/write their own path.
 *
 *   reports/ — generated PDF reports (private)
 *              Path convention: {schoolId}/{reportId}.pdf
 *              Bucket policy: private — only signed URLs work for reads.
 *
 * Design notes:
 * • Signed URLs are generated on-demand (never pre-fetched in list views).
 * • Default signed URL expiry is 10 minutes for reports (sensitive), 1 hour
 *   for images (less sensitive, changes rarely).
 * • Upload goes directly from client → Supabase Storage, bypassing the
 *   Next.js server to avoid unnecessary bandwidth.
 */

import { createClient } from "./client";
import { createAdminClient } from "./server";

const IMAGES_BUCKET =
  process.env.SUPABASE_STORAGE_IMAGES_BUCKET ?? "images";
const REPORTS_BUCKET =
  process.env.SUPABASE_STORAGE_REPORTS_BUCKET ?? "reports";

// ── Image helpers ─────────────────────────────────────────────────────────────

/**
 * Upload an image file (browser-side).
 * Returns the storage path on success, throws on failure.
 */
export async function uploadImage(
  file: File,
  schoolId: string,
  userId: string
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${schoolId}/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return path;
}

/**
 * Get a public URL for an image (works when the bucket is public).
 * If the bucket is private, use getImageSignedUrl instead.
 */
export function getImagePublicUrl(path: string): string {
  const supabase = createClient();
  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Generate a signed URL for an image (for private buckets).
 * Expires in 1 hour by default.
 */
export async function getImageSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl)
    throw new Error(`Could not generate image URL: ${error?.message}`);
  return data.signedUrl;
}

// ── Report helpers (server-side only — uses admin client) ─────────────────────

/**
 * Upload a PDF report buffer from the server.
 * Returns the storage path on success, throws on failure.
 * Call this from an API route / server action after generating the PDF.
 */
export async function uploadReport(
  buffer: Buffer,
  schoolId: string,
  reportId: string
): Promise<string> {
  const supabase = createAdminClient();
  const path = `${schoolId}/${reportId}.pdf`;

  const { error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw new Error(`Report upload failed: ${error.message}`);
  return path;
}

/**
 * Generate a short-lived signed URL for a private report.
 * Expires in 10 minutes by default — sufficient for a download/view action.
 * Call this only when the user actually opens a specific report.
 */
export async function getReportSignedUrl(
  path: string,
  expiresInSeconds = 600
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl)
    throw new Error(`Could not generate report URL: ${error?.message}`);
  return data.signedUrl;
}

/**
 * Delete a file from storage (e.g. when a user replaces their avatar).
 * Safe to call with either bucket name.
 */
export async function deleteStorageFile(
  bucket: "images" | "reports",
  path: string
): Promise<void> {
  const supabase = createAdminClient();
  const bucketName = bucket === "images" ? IMAGES_BUCKET : REPORTS_BUCKET;
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
