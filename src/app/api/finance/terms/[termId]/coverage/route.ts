/**
 * GET /api/finance/terms/[termId]/coverage
 * Returns which classes have a fee structure for this term and which don't.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(
  _req: NextRequest,
  { params }: { params: { termId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const term = await prisma.term.findFirst({
    where:  { id: params.termId, schoolId },
    select: { id: true, name: true, termNameId: true },
  });
  if (!term) return NextResponse.json({ error: "Term not found." }, { status: 404 });

  // All classes in the school
  const classes = await prisma.schoolClass.findMany({
    where:   { schoolId },
    select:  { id: true, name: true, form: true, stream: true },
    orderBy: [{ form: "asc" }, { stream: "asc" }],
  });

  // All fee structures — prefer termNameId match, fallback to null (all terms)
  const structures = await prisma.feeStructure.findMany({
    where: {
      schoolId,
      OR: [
        { termNameId: term.termNameId },
        { termNameId: null },
      ],
    },
    select: { form: true, stream: true, termNameId: true, amountPerTerm: true },
  });

  // Build a lookup: "form:stream" → best structure (term-specific wins over generic)
  const structureMap = new Map<string, { amountPerTerm: string; termSpecific: boolean }>();
  for (const s of structures) {
    const key = `${s.form}:${s.stream ?? ""}`;
    const existing = structureMap.get(key);
    const isTermSpecific = s.termNameId !== null;
    // Prefer term-specific over generic
    if (!existing || isTermSpecific) {
      structureMap.set(key, {
        amountPerTerm: s.amountPerTerm.toString(),
        termSpecific:  isTermSpecific,
      });
    }
  }

  const coverage = classes.map((cls) => {
    const key = `${cls.form}:${cls.stream ?? ""}`;
    const match = structureMap.get(key);
    return {
      classId:       cls.id,
      className:     cls.name,
      form:          cls.form,
      stream:        cls.stream,
      hasFees:       !!match,
      amountPerTerm: match?.amountPerTerm ?? null,
      termSpecific:  match?.termSpecific ?? false,
    };
  });

  const withFees    = coverage.filter(c => c.hasFees);
  const withoutFees = coverage.filter(c => !c.hasFees);

  return NextResponse.json({ termId: params.termId, coverage, withFees, withoutFees });
}
