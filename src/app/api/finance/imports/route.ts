/**
 * POST /api/finance/imports — Upload CSV/XLSX and create a FinanceImportJob
 *
 * For files estimated under 500 rows the job is processed synchronously and
 * the completed status is returned directly. Larger files return HTTP 202 with
 * the job ID so the client can poll GET /api/finance/imports/[id].
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as readline from "readline";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { buildSuggestedMapping } from "@/lib/finance/imports/columnMapper";
import { processImportJob } from "@/lib/finance/imports/processor";

const SMALL_FILE_ROW_LIMIT = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const metaSchema = z.object({
  importType:    z.enum(["PLAIN_LEDGER", "OPENING_BALANCE"]),
  columnMapping: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  // Only BURSAR can upload imports; PRINCIPAL gets read-only access
  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file           = formData.get("file") as File | null;
  const importTypeFd   = formData.get("importType") as string | null;
  const mappingRaw     = formData.get("columnMapping") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 400 });
  }

  let parsedMapping: Record<string, string> | undefined;
  try {
    parsedMapping = mappingRaw ? (JSON.parse(mappingRaw) as Record<string, string>) : undefined;
  } catch {
    return NextResponse.json({ error: "columnMapping must be valid JSON." }, { status: 400 });
  }

  const parsed = metaSchema.safeParse({ importType: importTypeFd, columnMapping: parsedMapping });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { importType, columnMapping } = parsed.data;

  // Save uploaded file to a temp path
  const ext     = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") ? ".xlsx" : ".csv";
  const tmpPath = path.join(os.tmpdir(), `finance-import-${Date.now()}${ext}`);
  const buffer  = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(tmpPath, buffer);

  // If no column mapping was provided, auto-suggest one and return it for the
  // bursar to review in the UI before re-submitting with the confirmed mapping.
  if (!columnMapping) {
    // Parse just the header row to suggest mapping
    const suggestedMapping = await suggestMappingFromFile(tmpPath, ext);
    return NextResponse.json({ suggestedMapping, tmpPath }, { status: 200 });
  }

  // Create the job record
  const job = await prisma.financeImportJob.create({
    data: {
      schoolId,
      importType,
      fileName:      tmpPath,
      columnMapping: columnMapping ?? undefined,
      status:        "QUEUED",
      createdById:   user.id,
    },
    select: { id: true },
  });

  // Heuristic: ~100 bytes per row → small file threshold
  const estimatedRows = Math.floor(file.size / 100);

  if (estimatedRows < SMALL_FILE_ROW_LIMIT) {
    // Small file: process synchronously
    await processImportJob(job.id);
    const completed = await prisma.financeImportJob.findUnique({
      where:  { id: job.id },
      select: { status: true, succeeded: true, failed: true, totalRows: true, errorReport: true },
    });
    return NextResponse.json({ jobId: job.id, ...completed });
  }

  // Large file: return immediately; client polls GET /api/finance/imports/[id]
  return NextResponse.json({ jobId: job.id, status: "QUEUED" }, { status: 202 });
}

/** Reads the first line of a CSV or the header row of an XLSX to build a suggested mapping. */
async function suggestMappingFromFile(
  filePath: string,
  ext: string
): Promise<Record<string, string>> {
  let headers: string[] = [];

  if (ext === ".xlsx") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xlsx      = (await import("xlsx")) as any;
    const workbook  = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0] as string;
    const sheet     = workbook.Sheets[sheetName];
    const rows      = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
    headers         = (rows[0] ?? []).map(String);
  } else {
    const firstLine = await readFirstLine(filePath);
    headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  }

  return buildSuggestedMapping(headers);
}

function readFirstLine(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    rl.once("line", (line: string) => { rl.close(); resolve(line); });
    rl.once("error", reject);
    rl.once("close", () => resolve(""));
  });
}
