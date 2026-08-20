import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const diagnostics: {
    timestamp: string;
    checks: Record<string, unknown>;
    overallStatus?: string;
  } = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      diagnostics.checks = { ...diagnostics.checks, database: "✅ Connected" };
    } catch (dbErr) {
      diagnostics.checks = {
        ...diagnostics.checks,
        database: `❌ Failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      };
    }

    try {
      const superAdmin = await prisma.$queryRaw<Array<{
        id: string;
        email: string;
        role: string;
        isActive: boolean;
        hasPassword: boolean;
      }>>`
        SELECT
          id,
          email,
          role::text AS role,
          "isActive",
          ("passwordHash" IS NOT NULL) as "hasPassword"
        FROM "User"
        WHERE role::text = 'SUPER_ADMIN'
        LIMIT 1
      `;

      if (superAdmin.length > 0) {
        const sa = superAdmin[0];
        diagnostics.checks = {
          ...diagnostics.checks,
          superAdmin: {
            status: "✅ Found",
            id: sa.id,
            email: sa.email,
            isActive: sa.isActive,
            hasPassword: sa.hasPassword,
          },
        };
      } else {
        diagnostics.checks = { ...diagnostics.checks, superAdmin: "❌ Not found" };
      }
    } catch (userErr) {
      diagnostics.checks = {
        ...diagnostics.checks,
        superAdmin: `❌ Query failed: ${userErr instanceof Error ? userErr.message : String(userErr)}`,
      };
    }

    try {
      const sessionCount = await prisma.session.count();
      diagnostics.checks = {
        ...diagnostics.checks,
        sessions: `✅ Table exists (${sessionCount} sessions)`,
      };
    } catch (sessErr) {
      diagnostics.checks = {
        ...diagnostics.checks,
        sessions: `❌ Table check failed: ${sessErr instanceof Error ? sessErr.message : String(sessErr)}`,
      };
    }

    try {
      const testHash = await hashPassword("password");
      const testResult = await verifyPassword("password", testHash);
      diagnostics.checks = {
        ...diagnostics.checks,
        bcrypt: testResult ? "✅ Working" : "⚠️ Verification returned false",
      };
    } catch (bcryptErr) {
      diagnostics.checks = {
        ...diagnostics.checks,
        bcrypt: `❌ Failed: ${bcryptErr instanceof Error ? bcryptErr.message : String(bcryptErr)}`,
      };
    }

    diagnostics.checks = {
      ...diagnostics.checks,
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ? "✅ Set" : "❌ Missing",
        SESSION_SECRET: process.env.SESSION_SECRET ? "✅ Set" : "❌ Missing",
        NODE_ENV: process.env.NODE_ENV,
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Set" : "❌ Missing",
      },
    };

    const allPassed = Object.values(diagnostics.checks).every((check) => {
      if (typeof check === "string") return check.includes("✅");
      if (typeof check === "object" && check !== null) {
        return Object.values(check as Record<string, unknown>).every((v) =>
          typeof v === "string" ? v.includes("✅") || v.includes("⚠️") : true
        );
      }
      return true;
    });

    diagnostics.overallStatus = allPassed ? "✅ All checks passed" : "⚠️ Some checks failed";

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (err) {
    console.error("[AUTH HEALTH] Fatal error:", err);
    return NextResponse.json(
      {
        error: "Health check failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
