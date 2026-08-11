/**
 * src/lib/supabase/storage.ts
 *
 * Upload and URL helpers for Supabase Storage.
 *
 * Bucket layout:
 *   images/  — avatars, school logos, stamps, student photos.
 *              Path: {schoolId}/{scope}/{id}/{timestamp}.{ext}
 *              Public bucket — URLs resolved via getPublicUrl (no signing needed).
 *
 *   reports/ — generated PDF reports. Private bucket.
 *              Path: {schoolId}/{reportId}.pdf
 *              Access only via short-lived signed URLs (10 min default).
 *
 * Rules:
 *   • All operations use createAdminClient() (service role) so they work
 *     regardless of whether a Supabase session exists in the current request.
 *   • Signed URLs are generated on-demand — never pre-fetched in list views.
 *   • Upload bypasses Next.js server for large files: client calls the
 *     /api/me/photo route which pipes through the admin client server-side.
 */

import { createAdminClient } from "./server";

const IMAGES_BUCKET  = process.env.SUPABASE_STORAGE_IMAGES_BUCKET  ?? "images";
const REPORTS_BUCKET = process.env.SUPABASE_STORAGE_REPORTS_BUCKET ?? "reports";

// ── Image helpers — all server-side via admin client ─────────────────────────

/**
 * Upload an image buffer (server-side, called from API routes).
 * Returns the storage path on success, throws on failure.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  mimeType: string,
  storagePath: string
): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return storagePath;
}

/**
 * Get the public URL for an image.
 * Works because the images bucket is public-read.
 */
export function getImagePublicUrl(storagePath: string): string {
  const supabase = createAdminClient();
  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Delete a file from the images bucket.
 * Non-fatal — logs but does not throw if the file is already gone.
 */
export async function deleteImage(storagePath: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(IMAGES_BUCKET).remove([storagePath]).catch((err) => {
    console.warn("[storage] deleteImage failed (non-fatal):", err);
  });
}

// ── Report helpers — server-side only ────────────────────────────────────────

/**
 * Upload a PDF buffer from the server after report generation.
 * Returns the storage path on success, throws on failure.
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
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Report upload failed: ${error.message}`);
  return path;
}

/**
 * Generate a short-lived signed URL for a private report.
 * Call this only when the user actually opens a specific report, never
 * during list-view rendering.
 * Default expiry: 10 minutes.
 */
export async function getReportSignedUrl(
  storagePath: string,
  expiresInSeconds = 600
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl)
    throw new Error(`Could not generate report URL: ${error?.message}`);
  return data.signedUrl;
}

/**
 * Delete a report file from storage.
 */
export async function deleteReport(storagePath: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(REPORTS_BUCKET).remove([storagePath]).catch((err) => {
    console.warn("[storage] deleteReport failed (non-fatal):", err);
  });
}
