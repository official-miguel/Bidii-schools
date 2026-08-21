/**
 * GET /api/library/copies/search
 *
 * Fast single-copy lookup purpose-built for the circulation desk.
 * Tries strategies in order of speed, stopping as soon as a match is found:
 *
 *   1. Exact accessionNumber match  (@@unique index — O(log n), ~1 ms)
 *   2. Exact bookNumber match       (@@unique index — O(log n), ~1 ms)
 *   3. Prefix accessionNumber       (B-tree range scan)
 *   4. Prefix bookNumber            (B-tree range scan)
 *   5. Exact catalogue.bookNumber   (catalogue unique index)
 *
 * Intentionally does NOT fall back to ILIKE / contains — that is what
 * makes the old /api/library/copies?q= endpoint slow.
 * For title/author searching use GET /api/library/catalogue?q= instead.
 *
 * Query params:
 *   ?q=ACC-00042   — accession number or book number typed/scanned by librarian
 *
 * Response (200):  { copy, catalogue }  — same shape as /copies/resolve
 * Response (404):  { error }            — nothing matched
 *
 * Also handles the signed QR token format transparently:
 *   If ?q= looks like a signed token (two base64url segments), it delegates
 *   to verifyQrToken + DB lookup exactly as /copies/resolve does.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { verifyQrToken, isSignedToken } from "@/lib/library/qr";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}

// Minimal select shape — only what the circulation desk needs
const COPY_SELECT = {
  id:              true,
  bookNumber:      true,
  accessionNumber: true,
  qrToken:         true,   // used internally for token-match; stripped from response
  status:          true,
  condition:       true,
  archivedAt:      true,
  catalogueId:     true,
  catalogue: {
    select: {
      id:          true,
      title:       true,
      author:      true,
      edition:     true,
      level:       true,
      subject:     true,
      form:        true,
      bookNumber:  true,
    },
  },
} as const;

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "?q= is required." }, { status: 400 });

  const schoolId = user.schoolId!;

  // ── Signed QR token ──────────────────────────────────────────────────────
  if (isSignedToken(q)) {
    const result = verifyQrToken(q, schoolId);
    if (!result.valid) {
      return NextResponse.json(
        {
          error:
            result.reason === "malformed"
              ? "QR code is malformed or tampered with."
              : result.reason === "bad_signature"
              ? "QR code signature is invalid."
              : "This QR code belongs to a different school.",
        },
        { status: result.reason === "school_mismatch" ? 403 : 400 }
      );
    }

    const copy = await prisma.libraryCopy.findFirst({
      where:  { id: result.payload.copy_id, schoolId },
      select: COPY_SELECT,
    });

    if (!copy)
      return NextResponse.json({ error: "Copy not found." }, { status: 404 });

    // Reissue check
    if (copy.qrToken !== q)
      return NextResponse.json(
        { error: "QR sticker has been superseded. Please use the current sticker." },
        { status: 404 }
      );

    if (copy.archivedAt)
      return NextResponse.json(
        { error: "This copy has been withdrawn from circulation." },
        { status: 410 }
      );

    const { qrToken: _t, ...safeCopy } = copy;
    return NextResponse.json({ copy: safeCopy, catalogue: copy.catalogue });
  }

  // Strip any legacy "BIDII:" prefix from raw QR payloads
  const normalised = q.startsWith("BIDII:") ? q.slice(6) : q;
  const upper      = normalised.toUpperCase();

  // ── Strategy 1: exact accessionNumber (unique index hit) ─────────────────
  let copy = await prisma.libraryCopy.findUnique({
    where:  { school_accessionNumber: { schoolId, accessionNumber: normalised } },
    select: COPY_SELECT,
  });

  // ── Strategy 2: exact bookNumber (unique index hit) ──────────────────────
  if (!copy) {
    copy = await prisma.libraryCopy.findFirst({
      where: {
        schoolId,
        bookNumber: normalised,
        archivedAt: null,
      },
      select: COPY_SELECT,
    });
  }

  // ── Strategy 3: case-insensitive exact accessionNumber ───────────────────
  if (!copy) {
    copy = await prisma.libraryCopy.findFirst({
      where: {
        schoolId,
        accessionNumber: { equals: upper, mode: "insensitive" },
        archivedAt: null,
      },
      select: COPY_SELECT,
    });
  }

  // ── Strategy 4: case-insensitive exact bookNumber ────────────────────────
  if (!copy) {
    copy = await prisma.libraryCopy.findFirst({
      where: {
        schoolId,
        bookNumber: { equals: normalised, mode: "insensitive" },
        archivedAt: null,
      },
      select: COPY_SELECT,
    });
  }

  // ── Strategy 5: prefix accessionNumber (e.g. "ACC-001" → "ACC-00100") ───
  if (!copy && normalised.length >= 3) {
    copy = await prisma.libraryCopy.findFirst({
      where: {
        schoolId,
        accessionNumber: { startsWith: normalised, mode: "insensitive" },
        archivedAt: null,
      },
      orderBy: { accessionNumber: "asc" },
      select:  COPY_SELECT,
    });
  }

  // ── Strategy 6: prefix bookNumber ────────────────────────────────────────
  if (!copy && normalised.length >= 3) {
    copy = await prisma.libraryCopy.findFirst({
      where: {
        schoolId,
        bookNumber: { startsWith: normalised, mode: "insensitive" },
        archivedAt: null,
      },
      orderBy: { bookNumber: "asc" },
      select:  COPY_SELECT,
    });
  }

  if (!copy)
    return NextResponse.json(
      { error: `No copy found for "${normalised}". Check the accession or book number.` },
      { status: 404 }
    );

  if (copy.archivedAt)
    return NextResponse.json(
      { error: "This copy has been withdrawn from circulation." },
      { status: 410 }
    );

  const { qrToken: _t, ...safeCopy } = copy;
  return NextResponse.json({ copy: safeCopy, catalogue: copy.catalogue });
}
