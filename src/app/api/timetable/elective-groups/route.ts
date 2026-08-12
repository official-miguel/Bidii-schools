/**
 * /api/timetable/elective-groups
 *
 * GET    — list all groups for the school, optionally filtered by scopeForm.
 *          Each group now includes its scopeStreams and the full list of
 *          teacher-subject pairings (ElectiveGroupTeacher rows).
 * POST   — create a new elective group (accepts scopeStreams)
 * PATCH  — update name / lessonsPerWeek / doublesPerWeek / scopeStreams  (body must include id)
 * DELETE — remove a group  (body must include id)
 *
 * scopeForm = 0  → school-wide
 * scopeForm = N  → Form N only
 *
 * scopeStreams = []        → all streams in the form
 * scopeStreams = ["North"] → only the named streams
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ── Auth helper ────────────────────────────────────────────────────────────

async function auth() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"))
  );
}

// ── Shared include for full group shape ────────────────────────────────────

function groupInclude() {
  return {
    members: {
      include: {
        subject: {
          select: { id: true, code: true, name: true, internalCode: true },
        },
      },
      orderBy: { subject: { name: "asc" as const } },
    },
    teachers: {
      include: {
        subject: { select: { id: true, code: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { subject: { name: "asc" as const } },
        { teacher: { fullName: "asc" as const } },
      ],
    },
  };
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const { searchParams } = new URL(req.url);
  const scopeFormParam = searchParams.get("scopeForm");

  // Build the where clause.
  // When a specific form is requested (scopeForm > 0), return both that form's
  // groups AND school-wide groups (scopeForm = 0) so nothing is hidden.
  // When scopeForm = 0 is explicitly requested, return only school-wide groups.
  // When no scopeForm param is given, return everything for the school.
  let where: Record<string, unknown>;
  if (scopeFormParam !== null) {
    const requestedForm = Number(scopeFormParam);
    if (requestedForm > 0) {
      // Form-specific view: include this form's groups + school-wide groups
      where = {
        schoolId,
        OR: [{ scopeForm: requestedForm }, { scopeForm: 0 }],
      };
    } else {
      // Explicitly asked for school-wide only (scopeForm=0)
      where = { schoolId, scopeForm: 0 };
    }
  } else {
    // No filter — return all groups for this school
    where = { schoolId };
  }

  try {
    const groups = await prisma.electiveGroup.findMany({
      where,
      include: groupInclude(),
      orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ groups });
  } catch {
    // ElectiveGroupTeacher table not yet migrated — fall back without teachers
    const groups = await prisma.electiveGroup.findMany({
      where,
      include: {
        members: {
          include: { subject: { select: { id: true, code: true, name: true, internalCode: true } } },
          orderBy: { subject: { name: "asc" } },
        },
      },
      orderBy: [{ scopeForm: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ groups: groups.map((g) => ({ ...g, teachers: [] })) });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:           z.string().min(1).max(50),
  scopeForm:      z.number().int().min(0),
  lessonsPerWeek: z.number().int().min(1).max(20),
  /// How many of those lessons should be double blocks (0 = all singles).
  doublesPerWeek: z.number().int().min(0).max(10).optional().default(0),
  /// Optional: restrict the group to specific stream names within the form.
  /// Omitting the field (or passing []) means the group applies to all streams.
  scopeStreams:   z.array(z.string().min(1)).optional().default([]),
});

export async function POST(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, scopeForm, lessonsPerWeek, doublesPerWeek, scopeStreams } = parsed.data;

  // Check uniqueness (name + scopeForm pair)
  const existing = await prisma.electiveGroup.findFirst({
    where: { schoolId, name, scopeForm },
  });
  if (existing) {
    const scope = scopeForm === 0 ? "school-wide" : `Form ${scopeForm}`;
    return NextResponse.json(
      { error: `A group named "${name}" already exists for ${scope}.` },
      { status: 409 },
    );
  }

  const group = await prisma.electiveGroup.create({
    data: { schoolId, name, scopeForm, lessonsPerWeek, doublesPerWeek, scopeStreams },
    include: groupInclude(),
  });

  return NextResponse.json({ group }, { status: 201 });
}

// ── PATCH ──────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  id:             z.string().min(1),
  name:           z.string().min(1).max(50).optional(),
  lessonsPerWeek: z.number().int().min(1).max(20).optional(),
  /// How many of those lessons should be double blocks (0 = all singles).
  doublesPerWeek: z.number().int().min(0).max(10).optional(),
  /// Pass an explicit array (even []) to update; omit the key to leave unchanged.
  scopeStreams:   z.array(z.string().min(1)).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id, name, lessonsPerWeek, doublesPerWeek, scopeStreams } = parsed.data;

  const group = await prisma.electiveGroup.findFirst({
    where: { id, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Name-uniqueness check on rename
  if (name && name !== group.name) {
    const clash = await prisma.electiveGroup.findFirst({
      where: { schoolId, name, scopeForm: group.scopeForm, id: { not: id } },
    });
    if (clash) {
      const scope = group.scopeForm === 0 ? "school-wide" : `Form ${group.scopeForm}`;
      return NextResponse.json(
        { error: `A group named "${name}" already exists for ${scope}.` },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.electiveGroup.update({
    where: { id },
    data: {
      ...(name            !== undefined ? { name }            : {}),
      ...(lessonsPerWeek  !== undefined ? { lessonsPerWeek }  : {}),
      ...(doublesPerWeek  !== undefined ? { doublesPerWeek }  : {}),
      ...(scopeStreams     !== undefined ? { scopeStreams }    : {}),
    },
    include: groupInclude(),
  });

  return NextResponse.json({ group: updated });
}

// ── DELETE ─────────────────────────────────────────────────────────────────

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Group id required" }, { status: 400 });
  }

  const group = await prisma.electiveGroup.findFirst({
    where: { id: parsed.data.id, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // ElectiveGroupMember and ElectiveGroupTeacher rows cascade-delete via FK
  await prisma.electiveGroup.delete({ where: { id: parsed.data.id } });

  return NextResponse.json({ ok: true });
}
