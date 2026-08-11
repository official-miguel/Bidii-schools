import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, SESSION_COOKIE, buildOfflineToken } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /// Optional school slug — required when the same email is registered at
  /// multiple schools. Ignored when omitted (falls back to findFirst).
  schoolSlug: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  try {
    // Validate environment variables
    if (!process.env.DATABASE_URL) {
      console.error("[LOGIN] Missing DATABASE_URL environment variable");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    if (!process.env.SESSION_SECRET) {
      console.error("[LOGIN] Missing SESSION_SECRET environment variable");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    // Test database connectivity
    try {
      await prisma.$connect();
    } catch (dbError) {
      console.error("[LOGIN] Database connection failed:", dbError);
      return NextResponse.json(
        { error: "Database connection failed. Please try again later." },
        { status: 503 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("[LOGIN] Failed to parse request body:", parseError);
      return NextResponse.json({ error: "Invalid request format." }, { status: 400 });
    }

    // Validate input schema
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    }

    const { email, password, schoolSlug } = parsed.data;

    // Same generic error for unknown email or wrong password — prevents
    // login from being used to enumerate registered accounts.
    const invalid = () =>
      NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

    // ── User lookup — school-scoped when a slug is provided ────────────────
    let user;
    // Set to true when the password has already been verified during the
    // multi-candidate selection phase so we don't hash twice.
    let passwordAlreadyVerified = false;
    try {
      if (schoolSlug) {
        // Two-step lookup: school by slug, then user by (schoolId, email).
        // This is the correct path when the same email exists at multiple schools.
        const school = await prisma.school.findUnique({
          where: { slug: schoolSlug },
          select: { id: true },
        });
        if (!school) {
          // Return the same generic error so slug enumeration isn't possible.
          return invalid();
        }
        user = await prisma.user.findFirst({
          where: { schoolId: school.id, email },
        });
      } else {
        // Fallback: no slug supplied — find all active accounts with this
        // email, then verify the password before doing anything else.
        // We never reveal whether multiple accounts exist until the password
        // has been proven correct, so a bad actor cannot enumerate multi-school
        // memberships or use this path for account discovery.
        const candidates = await prisma.user.findMany({
          where: { email, isActive: true },
          select: { id: true, email: true, passwordHash: true, role: true,
                    mustChangePassword: true, isActive: true, schoolId: true,
                    staffRoleId: true, createdAt: true, updatedAt: true,
                    avatarUrl: true, avatarStoragePath: true },
        });

        if (candidates.length === 0) {
          // No accounts — fall through to the invalid() call below.
          user = null;
        } else if (candidates.length === 1) {
          // Single account — normal path; password check happens below.
          user = candidates[0];
        } else {
          // Multiple accounts share this email.
          // Verify the password against each candidate BEFORE disclosing
          // ambiguity.  This prevents the multi-school hint from being used
          // as an oracle to discover which emails have cross-school accounts.
          const matched: typeof candidates = [];
          for (const candidate of candidates) {
            try {
              if (!candidate.passwordHash) continue; // OTP-only account — skip
              const passwordMatches = await verifyPassword(password, candidate.passwordHash);
              if (passwordMatches) matched.push(candidate);
            } catch {
              // If hashing fails for one account, skip it — don't abort the
              // whole request, just treat that candidate as non-matching.
            }
          }

          if (matched.length === 0) {
            // Wrong password — return the same generic error as always.
            return invalid();
          } else if (matched.length === 1) {
            // Password matches exactly one school account — log that user in
            // directly without requiring any extra step.
            user = matched[0];
            passwordAlreadyVerified = true;
          } else {
            // Extremely rare: same password hash matches accounts at more than
            // one school (e.g. a shared default password that was never changed).
            // Only NOW, after the password has been verified, do we ask for the
            // school identifier.  The message is intentionally vague.
            return NextResponse.json(
              {
                error:
                  "Your account is linked to more than one school. " +
                  "Please enter your school identifier to continue.",
                requiresSchoolSlug: true,
              },
              { status: 409 }
            );
          }
        }
      }
    } catch (userQueryError) {
      console.error("[LOGIN] Error querying user:", userQueryError);
      return NextResponse.json(
        { error: "Authentication service temporarily unavailable." },
        { status: 503 }
      );
    }

    if (!user || !user.isActive) return invalid();

    // Verify password (skip if already verified during multi-candidate selection)
    if (!passwordAlreadyVerified) {
      if (!user.passwordHash) {
        // OTP-only account — redirect to OTP flow with a friendly message.
        return NextResponse.json(
          { error: "This account uses one-time code login. Please use the code-based sign-in flow." },
          { status: 401 }
        );
      }
      let valid;
      try {
        valid = await verifyPassword(password, user.passwordHash);
      } catch {
        return NextResponse.json(
          { error: "Authentication service temporarily unavailable." },
          { status: 503 }
        );
      }
      if (!valid) return invalid();
    }

    // Create session
    let token;
    try {
      token = await createSession(user.id);
    } catch {
      return NextResponse.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    // Build offline token
    let offlineToken;
    try {
      offlineToken = buildOfflineToken(user);
    } catch {
      return NextResponse.json(
        { error: "Failed to create authentication token." },
        { status: 500 }
      );
    }

    const res = NextResponse.json({
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      offlineToken,
    });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;

  } catch (error) {
    console.error("[LOGIN] Unexpected error:", error);
    const errorMessage = process.env.NODE_ENV === "development"
      ? `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`
      : "An unexpected error occurred. Please try again.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  }
}
