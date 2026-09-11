import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import {
  STAGE_CATALOG,
  checkSkipStage,
  hasCatalog,
} from "@/lib/curriculum/stageCatalog";
import type { FrameworkType } from "@prisma/client";

// ---------------------------------------------------------------------------
// GET /api/classes/[id]/promotion-link
// Returns the current promotion configuration for a class, plus the
// auto-suggested target (§4a of the spec) and skip-stage status.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: {
      id: true,
      name: true,
      form: true,
      stageName: true,
      streamId: true,
      frameworkType: true,
      promotesToClassId: true,
      confirmedTerminal: true,
      resetTeachersOnPromotion: true,
      skipStageConfirmed: true,
      promotesTo: { select: { id: true, name: true, stageName: true, form: true } },
    },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  // Build auto-suggestion (§4a): same framework, same stream, rank + 1.
  let suggestion: { id: string; name: string; stageName: string | null } | null = null;

  if (!cls.promotesToClassId && !cls.confirmedTerminal && cls.stageName) {
    const catalog = STAGE_CATALOG[cls.frameworkType as FrameworkType];
    const currentEntry = catalog.find((s) => s.name === cls.stageName);
    if (currentEntry) {
      const nextRank = currentEntry.rank + 1;
      const candidates = await prisma.schoolClass.findMany({
        where: {
          schoolId:      user.schoolId,
          frameworkType: cls.frameworkType,
          streamId:      cls.streamId ?? null, // null matches null correctly
          form:          nextRank,             // form == rank for catalog classes
          stageName:     { not: null },
        },
        select: { id: true, name: true, stageName: true },
      });
      if (candidates.length === 1) {
        suggestion = candidates[0];
      }
      // 0 or >1 matches → leave suggestion null, principal chooses manually
    }
  }

  // Compute skip-stage status for the current saved link.
  let skipStatus: ReturnType<typeof checkSkipStage> | null = null;
  if (cls.promotesToClassId && cls.promotesTo && cls.stageName) {
    const catalog = STAGE_CATALOG[cls.frameworkType as FrameworkType];
    const srcEntry = catalog.find((s) => s.name === cls.stageName);
    const tgtEntry = cls.promotesTo.stageName
      ? catalog.find((s) => s.name === cls.promotesTo!.stageName)
      : null;

    skipStatus = checkSkipStage(
      cls.frameworkType as FrameworkType,
      srcEntry?.rank ?? null,
      cls.frameworkType as FrameworkType,
      tgtEntry?.rank ?? null
    );
  }

  return NextResponse.json({
    ...cls,
    suggestion,
    skipStatus,
    hasCatalog: hasCatalog(cls.frameworkType as FrameworkType),
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/classes/[id]/promotion-link
// Sets or clears the promotion link. Also handles the skip-stage confirmation
// flag and the resetTeachersOnPromotion toggle.
// ---------------------------------------------------------------------------
const patchSchema = z.object({
  /**
   * ID of the target class, or null to clear the link.
   * Mutually exclusive with confirmedTerminal: true.
   */
  promotesToClassId: z.string().nullable().optional(),
  /**
   * Mark this class as terminal (students graduate here).
   * Setting true clears promotesToClassId.
   */
  confirmedTerminal: z.boolean().optional(),
  /** Carry teacher assignments into the target class after promotion. */
  resetTeachersOnPromotion: z.boolean().optional(),
  /**
   * Principal has acknowledged the skip-stage warning for the current
   * promotesToClassId. Must be sent as true explicitly — never assumed.
   */
  skipStageConfirmed: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cls = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: {
      id: true,
      frameworkType: true,
      stageName: true,
      promotesToClassId: true,
      form: true,
    },
  });
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Cannot set both promotesToClassId and confirmedTerminal=true simultaneously.
  if (data.promotesToClassId && data.confirmedTerminal) {
    return NextResponse.json(
      { error: "A class cannot both promote to another class and be marked terminal." },
      { status: 400 }
    );
  }

  // Validate target class belongs to same school and same framework.
  if (data.promotesToClassId) {
    const target = await prisma.schoolClass.findFirst({
      where: { id: data.promotesToClassId, schoolId: user.schoolId },
      select: { id: true, frameworkType: true, name: true, stageName: true, form: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Target class not found." }, { status: 404 });
    }
    if (target.frameworkType !== cls.frameworkType) {
      return NextResponse.json(
        { error: "Promotion cannot cross curriculum frameworks." },
        { status: 400 }
      );
    }
    // Prevent a class pointing to itself.
    if (target.id === cls.id) {
      return NextResponse.json(
        { error: "A class cannot promote to itself." },
        { status: 400 }
      );
    }
  }

  // Build the update payload.
  const updateData: Record<string, unknown> = {};

  if (data.promotesToClassId !== undefined) {
    updateData.promotesToClassId = data.promotesToClassId;
    // Whenever the target changes, reset the confirmation flag unless the
    // caller explicitly re-confirms in the same request.
    updateData.skipStageConfirmed = data.skipStageConfirmed ?? false;
    if (data.promotesToClassId) {
      // Clearing terminal when a link is set.
      updateData.confirmedTerminal = false;
    }
  }

  if (data.confirmedTerminal !== undefined) {
    updateData.confirmedTerminal = data.confirmedTerminal;
    if (data.confirmedTerminal) {
      // Clearing the forward link when marking terminal.
      updateData.promotesToClassId  = null;
      updateData.skipStageConfirmed = false;
    }
  }

  if (data.resetTeachersOnPromotion !== undefined) {
    updateData.resetTeachersOnPromotion = data.resetTeachersOnPromotion;
  }

  // Allow updating skipStageConfirmed independently (e.g. confirmation dialog).
  if (data.skipStageConfirmed !== undefined && data.promotesToClassId === undefined) {
    updateData.skipStageConfirmed = data.skipStageConfirmed;
  }

  const updated = await prisma.schoolClass.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      promotesToClassId: true,
      confirmedTerminal: true,
      resetTeachersOnPromotion: true,
      skipStageConfirmed: true,
    },
  });

  // Compute fresh skip status so the UI can decide whether to show a warning.
  let skipStatus: ReturnType<typeof checkSkipStage> | null = null;
  if (updated.promotesToClassId && cls.stageName) {
    const target = await prisma.schoolClass.findUnique({
      where: { id: updated.promotesToClassId },
      select: { stageName: true, frameworkType: true, form: true },
    });
    if (target) {
      const catalog = STAGE_CATALOG[cls.frameworkType as FrameworkType];
      const srcRank = catalog.find((s) => s.name === cls.stageName)?.rank ?? null;
      const tgtRank = target.stageName
        ? (catalog.find((s) => s.name === target.stageName)?.rank ?? null)
        : null;
      skipStatus = checkSkipStage(
        cls.frameworkType as FrameworkType,
        srcRank,
        target.frameworkType as FrameworkType,
        tgtRank
      );
    }
  }

  return NextResponse.json({ ...updated, skipStatus });
}
