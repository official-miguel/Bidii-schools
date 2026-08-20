/**
 * GET  /api/finance/settings   — Read FinanceSettings with default fallback
 * POST /api/finance/settings   — Upsert FinanceSettings
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { encryptSecret } from "@/lib/crypto";

const DEFAULT_SETTINGS = {
  balanceThreshold:     "0",
  daysOverdueThreshold: 30,
  receiptPrefix:        "REC-",
  invoicePrefix:        "INV-",
  mpesaPaybillNumber:   null as string | null,
  mpesaWebhookUrl:      null as string | null,
  // Never return the secret
};

const settingsSchema = z.object({
  balanceThreshold:     z.number().min(0, "Balance threshold must be 0 or greater.").optional(),
  daysOverdueThreshold: z.number().int().positive("Days overdue threshold must be a positive integer.").optional(),
  receiptPrefix:        z.string().trim().min(1).optional(),
  invoicePrefix:        z.string().trim().min(1).optional(),
  mpesaPaybillNumber:   z.string().trim().optional().nullable(),
  mpesaWebhookSecret:   z.string().trim().optional().nullable(), // encrypted before storing
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const settings = await prisma.financeSettings.findUnique({
    where:  { schoolId },
    select: {
      balanceThreshold:     true,
      daysOverdueThreshold: true,
      receiptPrefix:        true,
      invoicePrefix:        true,
      mpesaPaybillNumber:   true,
      mpesaWebhookUrl:      true,
      // mpesaWebhookSecret intentionally excluded
    },
  });

  if (!settings) {
    return NextResponse.json({ settings: DEFAULT_SETTINGS });
  }

  return NextResponse.json({
    settings: {
      ...settings,
      balanceThreshold: settings.balanceThreshold.toString(),
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const data = parsed.data;

  try {
    // Preserve existing webhook URL — generate once, never regenerate
    const existing = await prisma.financeSettings.findUnique({
      where:  { schoolId },
      select: { mpesaWebhookUrl: true },
    });

    const webhookUrl = existing?.mpesaWebhookUrl ?? randomUUID();

    const upsertData: Record<string, unknown> = {
      schoolId,
      mpesaWebhookUrl: webhookUrl,
    };

    if (data.balanceThreshold     !== undefined) upsertData.balanceThreshold     = data.balanceThreshold;
    if (data.daysOverdueThreshold !== undefined) upsertData.daysOverdueThreshold = data.daysOverdueThreshold;
    if (data.receiptPrefix        !== undefined) upsertData.receiptPrefix        = data.receiptPrefix;
    if (data.invoicePrefix        !== undefined) upsertData.invoicePrefix        = data.invoicePrefix;
    if (data.mpesaPaybillNumber   !== undefined) upsertData.mpesaPaybillNumber   = data.mpesaPaybillNumber;
    if (data.mpesaWebhookSecret !== undefined && data.mpesaWebhookSecret !== null) {
      upsertData.mpesaWebhookSecret = encryptSecret(data.mpesaWebhookSecret);
    }

    await prisma.financeSettings.upsert({
      where:  { schoolId },
      create: upsertData as Parameters<typeof prisma.financeSettings.create>[0]["data"],
      update: upsertData as Parameters<typeof prisma.financeSettings.update>[0]["data"],
    });

    // Return updated settings (without the secret)
    const updated = await prisma.financeSettings.findUnique({
      where:  { schoolId },
      select: {
        balanceThreshold:     true,
        daysOverdueThreshold: true,
        receiptPrefix:        true,
        invoicePrefix:        true,
        mpesaPaybillNumber:   true,
        mpesaWebhookUrl:      true,
      },
    });

    return NextResponse.json({
      settings: {
        ...updated,
        balanceThreshold: updated?.balanceThreshold?.toString(),
      },
    });
  } catch (err) {
    console.error("[FINANCE/SETTINGS POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
