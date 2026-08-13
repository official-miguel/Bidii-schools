/**
 * GET /api/auth/health
 *
 * Health check endpoint to verify:
 * - Database connectivity
 * - Super admin user exists
 * - Session creation works
 * - Password verification works
 *
 * Returns detailed diagnostics (remove in production or secure this endpoint)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // 1. Check database connection
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      diagnostics.checks = { ...diagnostics.checks, database: "✅ Connected" };
    } catch (dbErr) {
      diagnostics.checks = { 
        ...diagnostics.checks, 
        database: `❌ Failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`
      };
    }

    // 2. Check super admin user exists
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
        const user = superAdmin[0];
        diagnostics.checks = {
          ...diagnostics.checks,
          superAdmin: {
            status: "✅ Found",
            id: user.id,
            email: user.email,
            isActive: user.isActive,
            hasPassword: user.hasPassword,
          },
        };
      } else {
        diagnostics.checks = {
          ...diagnostics.checks,
          superAdmin: "❌ Not found",
        };
      }
    } catch (userErr) {
      diagnostics.checks = {
        ...diagnostics.checks,
        superAdmin: `❌ Query failed: ${userErr instanceof Error ? userErr.message : String(userErr)}`,
      };
    }

    // 3. Check session table exists
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

    // 4. Check bcrypt works
    try {
      const testHash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIp3RvZHuy"; // "password"
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

    // 5. Check environment variables
    diagnostics.checks = {
      ...diagnostics.checks,
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ? "✅ Set" : "❌ Missing",
        SESSION_SECRET: process.env.SESSION_SECRET ? "✅ Set" : "❌ Missing",
        NODE_ENV: process.env.NODE_ENV,
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Set" : "❌ Missing",
      },
    };

    // Overall status
    const allPassed = Object.values(diagnostics.checks as Record<string, unknown>).every(
      (check) => {
        if (typeof check === "string") return check.includes("✅");
        if (typeof check === "object" && check !== null) {
          return Object.values(check).every((v) => 
            typeof v === "string" ? v.includes("✅") || v.includes("⚠️") : true
          );
        }
        return true;
      }
    );

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
