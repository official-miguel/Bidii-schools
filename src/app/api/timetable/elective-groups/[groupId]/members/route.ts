/**
 * /api/timetable/elective-groups/[groupId]/members
 *
 * POST   — add a subject to a group
 * DELETE — remove a subject from a group  (body: { subjectId })
 *
 * ── Hard invariant (enforced here and in buildLinkedClassGroups) ──────────
 *
 * The anchor subject of a group is its FIRST member, ordered by createdAt asc.
 * No two groups whose scopes overlap (same scopeForm + intersecting streams)
 * may share the same anchor subject.
 *
 * Why only the anchor?
 *   buildGroupAwarePayload collapses each group to a single solver requirement
 *   keyed on the anchor.  Non-anchor subjects are dropped from requirements and
 *   only re-emitted at fan-out time — they never appear as independent solver
 *   variables.  A non-anchor subject can therefore appear in multiple groups
 *   without any constraint conflict: each group schedules it independently under
 *   its own anchor's slot, and students in different elective baskets simply
 *   attend CRE (or whichever subject) at different times.
 *
 *   The anchor is different.  It IS a solver variable.  Two groups sharing the
 *   same anchor produce two "must be at the same (day, period)" constraints that
 *   together force every subject in both groups into one slot — requiring
 *   multiple teachers at the same time, which the solver correctly deems
 *   infeasible and resolves by scheduling 0 lessons for all involved subjects.
 *
 * ── Other rules ───────────────────────────────────────────────────────────
 *  • Subject must be type ELECTIVE.
 *  • Subject must be applicable to the group's scopeForm (or the group is school-wide).
 *  • Within the same group a subject can only appear once (DB unique constraint).
 *
 * ── Where the check fires ─────────────────────────────────────────────────
 *  POST   — when the group has 0 existing members (the new subject becomes anchor).
 *  DELETE — when the subject being removed IS the current anchor; the next member
 *            (by createdAt asc) would silently become the new anchor and could
 *            conflict with a sibling group.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function auth() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("TIMETABLE", "manage"))
  );
}

// ── Shared: load sibling groups with their current anchor subject ──────────

/**
 * Returns all sibling groups (same school, same scopeForm, different id)
 * that overlap in scope with `group`, including their current anchor subjectId.
 */
async function loadOverlappingSiblings(
  schoolId: string,
  groupId: string,
  scopeForm: number,
  scopeStreams: string[],
) {
  const siblings = await prisma.electiveGroup.findMany({
    where: {
      schoolId,
      id: { not: groupId },
      scopeForm,
    },
    select: {
      id: true,
      name: true,
      scopeStreams: true,
      members: {
        select: { subjectId: true },
        orderBy: { createdAt: "asc" },
        take: 1, // anchor only
      },
    },
  });

  const thisAllStreams = scopeStreams.length === 0;

  return siblings.filter((sib) => {
    const sibAllStreams = sib.scopeStreams.length === 0;
    return (
      sibAllStreams ||
      thisAllStreams ||
      sib.scopeStreams.some((s) => scopeStreams.includes(s))
    );
  });
}

// ── POST — add subject ─────────────────────────────────────────────────────

const addSchema = z.object({ subjectId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const { subjectId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Verify subject belongs to school and is ELECTIVE
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
  });
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }
  if (subject.type !== "ELECTIVE") {
    return NextResponse.json(
      { error: `"${subject.name}" is not an elective subject and cannot be added to a group.` },
      { status: 422 },
    );
  }

  // Validate the subject applies to the group's form scope
  if (
    group.scopeForm > 0 &&
    subject.applicableForms.length > 0 &&
    !subject.applicableForms.includes(group.scopeForm)
  ) {
    return NextResponse.json(
      {
        error: `"${subject.name}" does not apply to Form ${group.scopeForm}. Check the subject's applicable forms.`,
      },
      { status: 422 },
    );
  }

  // Already in this group?
  const existingMember = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
  });
  if (existingMember) {
    return NextResponse.json(
      { error: `"${subject.name}" is already in this group.` },
      { status: 409 },
    );
  }

  // ── Anchor uniqueness check (POST path) ───────────────────────────────────
  // This subject becomes the anchor if and only if the group currently has no
  // members.  Only in that case do we need to verify no sibling group in the
  // same scope already claims this subject as its anchor.
  const existingMemberCount = await prisma.electiveGroupMember.count({
    where: { groupId },
  });

  if (existingMemberCount === 0) {
    const overlapping = await loadOverlappingSiblings(
      schoolId,
      groupId,
      group.scopeForm,
      group.scopeStreams,
    );

    for (const sib of overlapping) {
      if (sib.members[0]?.subjectId === subjectId) {
        const scopeLabel =
          group.scopeForm === 0 ? "school-wide" : `Form ${group.scopeForm}`;
        return NextResponse.json(
          {
            error:
              `"${subject.name}" is already the anchor (first subject) of group ` +
              `"${sib.name}" in the same scope (${scopeLabel}). ` +
              `Each group in the same scope must start with a unique anchor subject. ` +
              `Choose a different first subject for this group, or add "${subject.name}" ` +
              `as a non-anchor (second or later) member instead.`,
          },
          { status: 409 },
        );
      }
    }
  }

  const member = await prisma.electiveGroupMember.create({
    data: { id: generateId(), groupId, subjectId },
    include: {
      subject: { select: { id: true, code: true, name: true, internalCode: true } },
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}

// ── DELETE — remove subject ────────────────────────────────────────────────

const removeSchema = z.object({ subjectId: z.string().min(1) });

export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const { subjectId } = parsed.data;
  const { groupId } = params;

  // Verify group belongs to school
  const group = await prisma.electiveGroup.findFirst({
    where: { id: groupId, schoolId },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const member = await prisma.electiveGroupMember.findFirst({
    where: { groupId, subjectId },
  });
  if (!member) {
    return NextResponse.json({ error: "Subject is not in this group" }, { status: 404 });
  }

  // ── Anchor uniqueness check (DELETE path) ─────────────────────────────────
  // When the subject being removed is the CURRENT anchor (first member by
  // createdAt asc), the second member silently becomes the new anchor.  If that
  // new anchor is already the anchor of a sibling group in the same scope the
  // invariant would be violated without any further write operation.
  //
  // Load all members ordered by createdAt to find the current anchor and the
  // would-be new anchor.
  const allMembers = await prisma.electiveGroupMember.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
    select: { subjectId: true },
  });

  const currentAnchorId = allMembers[0]?.subjectId;
  const isRemovingAnchor = currentAnchorId === subjectId;

  if (isRemovingAnchor && allMembers.length >= 2) {
    // The second member (index 1) becomes the new anchor after removal.
    const newAnchorId = allMembers[1].subjectId;

    const overlapping = await loadOverlappingSiblings(
      schoolId,
      groupId,
      group.scopeForm,
      group.scopeStreams,
    );

    for (const sib of overlapping) {
      if (sib.members[0]?.subjectId === newAnchorId) {
        // Fetch the new-anchor subject name for the error message
        const newAnchorSubject = await prisma.subject.findUnique({
          where: { id: newAnchorId },
          select: { name: true, code: true },
        });
        const scopeLabel =
          group.scopeForm === 0 ? "school-wide" : `Form ${group.scopeForm}`;
        return NextResponse.json(
          {
            error:
              `Removing this subject would make "${newAnchorSubject?.code ?? newAnchorId}" ` +
              `the new anchor of group "${group.name}", but it is already the anchor of ` +
              `"${sib.name}" in the same scope (${scopeLabel}). ` +
              `Re-order the subjects in this group (add a different subject first) ` +
              `before removing this one.`,
          },
          { status: 409 },
        );
      }
    }
  }

  await prisma.electiveGroupMember.delete({ where: { id: member.id } });

  return NextResponse.json({ ok: true });
}

// ── Tiny ID generator (avoids importing cuid2 just for this) ───────────────
function generateId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
