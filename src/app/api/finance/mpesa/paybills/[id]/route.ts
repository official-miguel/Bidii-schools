/**
 * PATCH  /api/finance/mpesa/paybills/[id]  — Update paybill (label, paybillNumber, secret, isActive)
 * DELETE /api/finance/mpesa/paybills/[id]  — Delete a paybill
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { encryptSecret } from "@/lib/crypto";

const updateSchema = z.object({
  label:         z.string().trim().min(1).optional(),
  paybillNumber: z.string().trim().min(1).optional(),
  webhookSecret: z.string().trim().optional().nullable(),
  isActive:      z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.schoolMpesaPaybill.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.label         !== undefined) updateData.label         = parsed.data.label;
  if (parsed.data.paybillNumber !== undefined) updateData.paybillNumber = parsed.data.paybillNumber;
  if (parsed.data.isActive      !== undefined) updateData.isActive      = parsed.data.isActive;
  if (parsed.data.webhookSecret !== undefined && parsed.data.webhookSecret !== null) {
    updateData.webhookSecret = encryptSecret(parsed.data.webhookSecret);
  }

  const updated = await prisma.schoolMpesaPaybill.update({
    where:  { id: params.id },
    data:   updateData as Parameters<typeof prisma.schoolMpesaPaybill.update>[0]["data"],
    select: { id: true, label: true, paybillNumber: true, webhookUrl: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ paybill: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.schoolMpesaPaybill.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.schoolMpesaPaybill.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
