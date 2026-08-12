import { NextRequest, NextResponse } from "next/server";
import { prisma }                      from "@/lib/prisma";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import { createSession }               from "@/lib/auth";
import { cookies }                     from "next/headers";

/**
 * POST /api/super-admin/schools/[id]/impersonate
 * Creates a temporary session as the PRINCIPAL of this school and returns
 * the redirect URL. Logs the action to SuperAdminAuditLog.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const superAdmin = await requireSuperAdmin();
  if (!superAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find the PRINCIPAL user for this school
  const principal = await prisma.user.findFirst({
    where: { schoolId: params.id, role: "PRINCIPAL", isActive: true },
  });

  if (!principal) {
    return NextResponse.json({ error: "No active principal found for this school" }, { status: 404 });
  }

  const token = await createSession(principal.id);

  // Set the session cookie (same name as the rest of the app)
  cookies().set("bidii_session", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60, // 1 hour impersonation session
  });

  await logAudit(
    superAdmin.id,
    "IMPERSONATION_STARTED",
    "school",
    params.id,
    { principalId: principal.id, principalEmail: principal.email }
  );

  return NextResponse.json({ redirectTo: "/principal" });
}
