/**
 * GET /api/finance/imports/template/[importType] — Download a CSV template
 *
 * Returns a pre-built CSV with the required column headers and one example row
 * so the bursar knows exactly how to format their import file.
 *
 * importType must be one of: PLAIN_LEDGER | OPENING_BALANCE
 */
import { NextRequest, NextResponse } from "next/server";
import { buildTemplateCsv } from "@/lib/finance/imports/columnMapper";

export async function GET(
  _req: NextRequest,
  { params }: { params: { importType: string } }
) {
  const type = params.importType.toUpperCase();

  if (type !== "PLAIN_LEDGER" && type !== "OPENING_BALANCE") {
    return NextResponse.json(
      { error: "Invalid import type. Must be PLAIN_LEDGER or OPENING_BALANCE." },
      { status: 400 }
    );
  }

  const csv      = buildTemplateCsv(type as "PLAIN_LEDGER" | "OPENING_BALANCE");
  const filename = `finance-import-template-${type.toLowerCase()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
