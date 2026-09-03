"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSession,
  buildOfflineToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/auth";

const GENERIC_ERROR = "Invalid credentials";

/**
 * Server action for the parent login page.
 *
 * Reads `phone`, `admissionNumber`, and `schoolId` from the submitted form.
 * Returns `{ error: string }` on failure (always generic — never reveals which
 * field caused the mismatch). On success, sets the `bidii_session` cookie and
 * redirects to `/parent` (or `/parent-login/set-password` on first login).
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */
export async function parentLogin(
  formData: FormData
): Promise<{ error: string } | never> {
  const phone = String(formData.get("phone") ?? "").trim();
  const admissionNumber = String(formData.get("admissionNumber") ?? "").trim();
  const schoolId = String(formData.get("schoolId") ?? "").trim();

  // Basic presence check — same generic error keeps response uniform (Req 2.5, 2.6)
  if (!phone || !admissionNumber || !schoolId) {
    return { error: GENERIC_ERROR };
  }

  // 1. Look up the parent by (schoolId, phone) — Requirements 2.2
  const parent = await prisma.parent.findUnique({
    where: { schoolId_phone: { schoolId, phone } },
    include: {
      user: true,
      students: {
        include: {
          student: { select: { id: true, admissionNumber: true } },
        },
      },
    },
  });

  // 2. Generic failure if no parent found or the underlying user is inactive
  if (!parent || !parent.user.isActive) {
    return { error: GENERIC_ERROR };
  }

  // 3. Verify the supplied admissionNumber against the stored password hash.
  //    On first login the hash was seeded from the student's admission number.
  //    After the parent sets a personal password mustChangePassword becomes false,
  //    at which point the admission number is no longer a valid credential (Req 2.4).
  const validPassword = await verifyPassword(
    admissionNumber,
    parent.user.passwordHash ?? ""
  );

  if (!validPassword) {
    return { error: GENERIC_ERROR };
  }

  // 4. Build and persist the session cookie — Requirements 2.7, 2.8
  const sessionToken = await createSession(parent.userId);

  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  // 5. Enforce password-change flow for first-time logins — Requirement 2.3
  if (parent.user.mustChangePassword) {
    redirect("/parent-login/set-password");
  }

  // 6. Normal login — build offline token and redirect to dashboard
  void buildOfflineToken(parent.user);

  redirect("/parent");
}

/**
 * Resolves a schoolId from a URL slug (or falls back to the first active school
 * for single-school deployments). Called server-side inside the page component
 * so the hidden schoolId field is pre-populated before the form renders.
 */
export async function resolveSchoolId(slug: string | null): Promise<string> {
  if (slug) {
    const school = await prisma.school.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (school) return school.id;
  }

  // Fallback: first school in the database (single-school deployment)
  const fallback = await prisma.school.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return fallback?.id ?? "";
}
