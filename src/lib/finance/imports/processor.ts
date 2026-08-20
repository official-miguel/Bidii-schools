/**
 * src/lib/finance/imports/processor.ts
 *
 * Finance import processor for CSV and XLSX files.
 * Supports PLAIN_LEDGER and OPENING_BALANCE import types.
 *
 * Processing strategy:
 * - Rows are processed in batches of 50.
 * - Invalid rows are recorded in errorReport and skipped; valid rows continue.
 * - A row failing one student never aborts the rest.
 * - On completion: status = COMPLETED if succeeded > 0, else FAILED.
 */

import * as readline from "readline";
import * as fs from "fs";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { applyMapping, type ColumnMapping, type ImportRow } from "./columnMapper";

type ErrorRecord = { row: number; values: Record<string, string>; reason: string };

const BATCH_SIZE = 50;

/**
 * Main entry point — processes a FinanceImportJob by its ID.
 * Called either synchronously (small files) or via polling (large files).
 */
export async function processImportJob(jobId: string): Promise<void> {
  // Load the job
  const job = await prisma.financeImportJob.findUnique({
    where:  { id: jobId },
    select: { id: true, schoolId: true, importType: true, fileName: true, columnMapping: true, createdById: true, status: true },
  });

  if (!job || job.status !== "QUEUED") return;

  // Mark as PROCESSING
  await prisma.financeImportJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });

  const errors: ErrorRecord[] = [];
  let succeeded = 0;
  let totalRows  = 0;

  try {
    const mapping = job.columnMapping as ColumnMapping | null;
    if (!mapping) throw new Error("Column mapping not configured.");

    // Parse rows from file (CSV or XLSX)
    const rows = await parseFile(job.fileName);
    totalRows  = rows.length;

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const rowNum = i + j + 2; // 1-indexed, +1 for header row
        const rawRow = batch[j];

        const importRow = applyMapping(rawRow, mapping);
        if (!importRow) {
          errors.push({ row: rowNum, values: rawRow, reason: "Missing required fields (admissionNumber or amount)." });
          continue;
        }

        try {
          await processRow(importRow, job.schoolId, job.importType as "PLAIN_LEDGER" | "OPENING_BALANCE", job.createdById);
          succeeded++;
        } catch (err) {
          errors.push({ row: rowNum, values: rawRow, reason: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }

    const finalStatus = succeeded > 0 ? "COMPLETED" : "FAILED";
    await prisma.financeImportJob.update({
      where: { id: jobId },
      data: { status: finalStatus, totalRows, succeeded, failed: errors.length, errorReport: errors },
    });
  } catch (err) {
    await prisma.financeImportJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorReport: [{ row: 0, values: {}, reason: err instanceof Error ? err.message : "Job failed" }] },
    });
  }
}

/** Processes one import row — resolves student, then posts ledger entry. */
async function processRow(
  row: ImportRow,
  schoolId: string,
  importType: "PLAIN_LEDGER" | "OPENING_BALANCE",
  postedById: string
): Promise<void> {
  // Resolve student by admission number
  const student = await prisma.student.findFirst({
    where: { schoolId, admissionNumber: row.admissionNumber, archivedAt: null },
    select: { id: true },
  });

  if (!student) throw new Error(`Student with admission number "${row.admissionNumber}" not found.`);

  const amount = new Decimal(Math.abs(row.amount).toString());
  if (amount.isZero()) throw new Error("Amount must be non-zero.");

  // Ensure a StudentFinanceAccount exists
  await prisma.studentFinanceAccount.upsert({
    where:  { schoolId_studentId: { schoolId, studentId: student.id } },
    create: { schoolId, studentId: student.id, currentBalance: 0, totalInvoiced: 0, totalPaid: 0 },
    update: {},
  });

  const entryType = importType === "OPENING_BALANCE"
    ? "OPENING_BALANCE" as const
    : (row.amount >= 0 ? "PAYMENT" as const : "DEBIT_ADJUSTMENT" as const);

  await prisma.$transaction(async (tx) => {
    await postLedgerEntry(tx, {
      schoolId,
      studentId:    student.id,
      entryType,
      amount,
      description:  row.description ?? (importType === "OPENING_BALANCE" ? "Opening balance import" : "Ledger import"),
      paymentMethod: row.paymentMethod as "MPESA" | "CASH" | "BANK_TRANSFER" | "CHEQUE" | undefined,
      referenceId:  row.reference,
      postedById,
      ...(row.date ? { postedAt: row.date } as Record<string, unknown> : {}),
    });
  });
}

/** Parses a CSV or XLSX file into an array of raw row objects (header-keyed). */
async function parseFile(filePath: string): Promise<Array<Record<string, string>>> {
  const ext = filePath.split(".").pop()?.toLowerCase();

  if (ext === "xlsx" || ext === "xls") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xlsx = (await import("xlsx")) as any;
    const workbook  = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0] as string;
    const sheet     = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, string>>;
  }

  // CSV fallback using readline
  return new Promise((resolve, reject) => {
    const rows:    Record<string, string>[] = [];
    let   headers: string[] = [];
    let   lineNum  = 0;

    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

    rl.on("line", (line) => {
      lineNum++;
      const cols = parseCsvLine(line);
      if (lineNum === 1) {
        headers = cols;
      } else if (cols.length > 0) {
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
        rows.push(row);
      }
    });

    rl.on("close", () => resolve(rows));
    rl.on("error", reject);
  });
}

/** Minimal RFC 4180-compliant CSV line parser. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}
