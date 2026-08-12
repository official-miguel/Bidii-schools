import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { prisma }                   from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { requirePermission, requireSchoolPermission } from "@/lib/permissions";
import { randomUUID }               from "crypto";

type Ctx = { params: { id: string } };

/**
 * LOCK SCOPES
 *  SLOT     — lock only this specific (classId, day, period) slot
 *  SUBJECT  — lock all slots for this (classId, subjectId)
 *  CLASS    — lock every slot belonging to this classId in the version
 *  DAY      — lock every slot for this classId on a specific dayOfWeek
 *  TEACHER  — lock every slot taught by this teacherId in the version
 */
const VALID_SCOPES = ["SLOT", "SUBJECT", "CLASS", "DAY", "TEACHER"] as const;

const schema = z.object({
  slotId:    z.string().min(1),
  lock:      z.boolean(),   // true = lock, false = unlock
  scope:     z.enum(VALID_SCOPES).default("SLOT"),
  reason:    z.string().trim().max(300).optional(),
});

/**
 * PATCH /api/timetable/v2/versions/[id]/lock
 *
 * Toggles isLocked on one or many slots in a DRAFT version.
 * The scope determines which slots are affected:
 *   SLOT    → just the specified slotId
 *   SUBJECT → all slots for the same (classId, subjectId)
 *   CLASS   → all slots for the same classId
 *   DAY     → all slots for classId on the same dayOfWeek
 *   TEACHER → all slots for the same teacherId
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: body.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { slotId, lock, scope, reason } = body.data;

  // Verify version ownership and editability
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED")
    return NextResponse.json({ error: "Cannot lock/unlock slots in an archived version." }, { status: 409 });

  // Load the anchor slot to extract classId / subjectId / teacherId / dayOfWeek
  const anchor = await prisma.$queryRaw<Array<{
    classId: string; subjectId: string; teacherId: string; dayOfWeek: number;
  }>>`
    SELECT "classId", "subjectId", "teacherId", "dayOfWeek"
    FROM "TimetableVersionSlot"
    WHERE id = ${slotId} AND "versionId" = ${params.id}`;

  if (!anchor[0]) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  const { classId, subjectId, teacherId, dayOfWeek } = anchor[0];

  const now     = new Date();
  const lockedAt     = lock ? now : null;
  const lockedById   = lock ? user.id : null;
  const lockScopeVal = lock ? scope : null;
  const lockReasonVal= lock ? (reason ?? null) : null;

  // Build the WHERE clause based on scope
  let affectedCount = 0;

  if (scope === "SLOT") {
    await prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "isLocked" = ${lock}, "lockScope" = ${lockScopeVal},
          "lockedAt" = ${lockedAt}, "lockedById" = ${lockedById},
          "lockReason" = ${lockReasonVal}, "updatedAt" = ${now}
      WHERE id = ${slotId} AND "versionId" = ${params.id}`;
    affectedCount = 1;

  } else if (scope === "SUBJECT") {
    const result = await prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "isLocked" = ${lock}, "lockScope" = ${lockScopeVal},
          "lockedAt" = ${lockedAt}, "lockedById" = ${lockedById},
          "lockReason" = ${lockReasonVal}, "updatedAt" = ${now}
      WHERE "versionId" = ${params.id}
        AND "classId" = ${classId} AND "subjectId" = ${subjectId}`;
    affectedCount = Number(result);

  } else if (scope === "CLASS") {
    const result = await prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "isLocked" = ${lock}, "lockScope" = ${lockScopeVal},
          "lockedAt" = ${lockedAt}, "lockedById" = ${lockedById},
          "lockReason" = ${lockReasonVal}, "updatedAt" = ${now}
      WHERE "versionId" = ${params.id} AND "classId" = ${classId}`;
    affectedCount = Number(result);

  } else if (scope === "DAY") {
    const result = await prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "isLocked" = ${lock}, "lockScope" = ${lockScopeVal},
          "lockedAt" = ${lockedAt}, "lockedById" = ${lockedById},
          "lockReason" = ${lockReasonVal}, "updatedAt" = ${now}
      WHERE "versionId" = ${params.id}
        AND "classId" = ${classId} AND "dayOfWeek" = ${dayOfWeek}`;
    affectedCount = Number(result);

  } else if (scope === "TEACHER") {
    const result = await prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "isLocked" = ${lock}, "lockScope" = ${lockScopeVal},
          "lockedAt" = ${lockedAt}, "lockedById" = ${lockedById},
          "lockReason" = ${lockReasonVal}, "updatedAt" = ${now}
      WHERE "versionId" = ${params.id} AND "teacherId" = ${teacherId}`;
    affectedCount = Number(result);
  }

  // Audit
  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", "slotId", action, "changeSource", detail,
       "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${user.schoolId}, ${params.id}, ${slotId},
      ${lock ? "LOCK" : "UNLOCK"}::"TimetableChangeAction",
      'MANUAL',
      ${JSON.stringify({ scope, lock, reason: reason ?? null, affectedCount })}::jsonb,
      ${user.id}, ${now})`;

  return NextResponse.json({ ok: true, affectedCount });
}
