import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";

function slugify(name: string) {
  return (
    name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "school"
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  let n = 1;
  while (await prisma.school.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

const schema = z.object({
  schoolName:     z.string().trim().min(2, "Enter your school's name."),
  schoolEmail:    z.string().trim().email("Enter a valid school email address."),
  schoolAddress:  z.string().trim().optional().or(z.literal("")),
  schoolPhone:    z.string().trim().optional().or(z.literal("")),
  fullName:       z.string().trim().min(2, "Enter your full name."),
  principalEmail: z.string().trim().email("Enter a valid personal email address."),
  // password is now optional — signup creates OTP-only accounts.
  // Kept in schema so the existing signup form still works if submitted with a value.
  password:       z.string().optional().or(z.literal("")),
}).refine(
  (d) => d.schoolEmail.toLowerCase() !== d.principalEmail.toLowerCase(),
  {
    message: "Your personal login email must be different from the school email.",
    path: ["principalEmail"],
  }
);

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    // ── Check if school email already exists ──────────────────────────────
    const existingSchool = await prisma.school.findFirst({
      where: { email: data.schoolEmail },
      select: { id: true, name: true },
    });

    if (existingSchool) {
      // Path B — Incoming Principal for existing school
      const activePrincipal = await prisma.user.findFirst({
        where: { schoolId: existingSchool.id, role: "PRINCIPAL", isActive: true },
        select: { id: true },
      });

      if (activePrincipal) {
        return NextResponse.json(
          {
            error:
              "This school already has an active Principal. The current Principal must transfer or deactivate their account before a new one can be registered.",
            code: "PRINCIPAL_ALREADY_EXISTS",
          },
          { status: 409 }
        );
      }

      const emailConflict = await prisma.user.findFirst({
        where: { schoolId: existingSchool.id, email: data.principalEmail, isActive: true },
        select: { id: true },
      });
      if (emailConflict) {
        return NextResponse.json(
          { error: "That email address is already in use at this school." },
          { status: 409 }
        );
      }

      // OTP-only account — no passwordHash
      const user = await prisma.user.create({
        data: {
          schoolId:           existingSchool.id,
          email:              data.principalEmail,
          passwordHash:       null,
          role:               "PRINCIPAL",
          mustChangePassword: false,
        },
      });

      const token = await createSession(user.id);
      const res = NextResponse.json(
        { role: user.role, schoolName: existingSchool.name, isExistingSchool: true },
        { status: 201 }
      );
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        path:     "/",
        maxAge:   Math.floor(SESSION_TTL_MS / 1000),
      });
      return res;
    }

    // Path A — New school
    const slug = await uniqueSlug(slugify(data.schoolName));

    const { user } = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name:    data.schoolName,
          slug,
          address: data.schoolAddress || null,
          phone:   data.schoolPhone   || null,
          email:   data.schoolEmail,
        },
      });

      // OTP-only account — no passwordHash
      const user = await tx.user.create({
        data: {
          schoolId:           school.id,
          email:              data.principalEmail,
          passwordHash:       null,
          role:               "PRINCIPAL",
          mustChangePassword: false,
        },
      });

      return { school, user };
    });

    const token = await createSession(user.id);
    const res = NextResponse.json({ role: user.role, isExistingSchool: false }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   60 * 60 * 24 * 7,
    });
    return res;

  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] | string } };
    if (err.code === "P2002") {
      const target: (string | undefined)[] = Array.isArray(err.meta?.target)
        ? err.meta.target : [err.meta?.target];
      if (target.includes("slug")) {
        return NextResponse.json(
          { error: "A school with a very similar name is already registered. Try a slightly different name." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "That email address is already registered. Try logging in instead." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't create the account. Please try again." },
      { status: 500 }
    );
  }
}
