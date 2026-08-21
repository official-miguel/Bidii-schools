/**
 * GET    /api/finance/mpesa/paybills  — List all paybills for the school
 * POST   /api/finance/mpesa/paybills  — Add a new paybill
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { encryptSecret } from "@/lib/crypto";

const createSchema = z.object({
  label:         z.string().trim().min(1, "Label is required."),
  paybillNumber: z.string().trim().min(1, "Paybill number is required."),
  webhookSecret: z.string().trim().optional().nullable(),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const paybills = await prisma.schoolMpesaPaybill.findMany({
    where:   { schoolId },
    orderBy: { createdAt: "asc" },
    select:  { id: true, label: true, paybillNumber: true, webhookUrl: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ paybills });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot add paybills." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { label, paybillNumber, webhookSecret } = parsed.data;

  const paybill = await prisma.schoolMpesaPaybill.create({
    data: {
      schoolId,
      label,
      paybillNumber,
      webhookUrl:    randomUUID(),
      webhookSecret: webhookSecret ? encryptSecret(webhookSecret) : null,
      isActive:      true,
    },
    select: { id: true, label: true, paybillNumber: true, webhookUrl: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ paybill }, { status: 201 });
}
