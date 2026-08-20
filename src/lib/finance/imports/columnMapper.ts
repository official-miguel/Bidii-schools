/**
 * src/lib/finance/imports/columnMapper.ts
 *
 * Header normalisation and column mapping for the finance CSV/Excel import flow.
 *
 * The import UI shows the bursar their spreadsheet's column headers and lets
 * them map each to a canonical system field. This module handles:
 *  1. Normalising raw header strings → canonical field names (auto-suggest)
 *  2. Applying a confirmed mapping to transform a raw row into a typed ImportRow
 */

// Canonical field names used throughout the import processor
export type CanonicalField =
  | "admissionNumber"
  | "amount"
  | "date"
  | "description"
  | "paymentMethod"
  | "reference"
  | "balance"       // for opening-balance import
  | "studentName"   // informational only
  | "ignore";       // explicitly skip this column

// A mapping from raw header → canonical field
export type ColumnMapping = Record<string, CanonicalField>;

// A typed import row after mapping is applied
export interface ImportRow {
  admissionNumber: string;
  amount:          number;
  date?:           Date;
  description?:    string;
  paymentMethod?:  string;
  reference?:      string;
  balance?:        number; // only for OPENING_BALANCE imports
}

// ---------------------------------------------------------------------------
// Header normalisation aliases
// Each canonical field has a list of known aliases. The normaliser checks
// if a lowercased, whitespace-collapsed header matches any alias.
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  admissionNumber: [
    "admissionnumber", "admission number", "admission no", "admission no.",
    "adm number", "adm no", "adm no.", "adm#", "admno", "student id",
    "studentid", "student number", "studentnumber", "regno", "reg no",
    "reg no.", "registration number", "id",
  ],
  amount: [
    "amount", "amount (kes)", "amount kes", "payment amount", "fee amount",
    "total", "sum", "paid", "paid amount", "payment",
  ],
  date: [
    "date", "payment date", "date paid", "transaction date", "date of payment",
    "date posted", "posting date", "value date",
  ],
  description: [
    "description", "details", "narration", "remarks", "note", "notes",
    "particulars", "memo", "reference description",
  ],
  paymentMethod: [
    "payment method", "paymentmethod", "method", "mode", "mode of payment",
    "payment mode", "payment type", "type",
  ],
  reference: [
    "reference", "ref", "ref no", "ref no.", "reference number", "ref number",
    "transaction ref", "transaction id", "transactionid", "mpesa code",
    "mpesa ref", "receipt number", "cheque number", "bank ref",
  ],
  balance: [
    "balance", "opening balance", "starting balance", "carried forward",
    "b/f", "balance b/f", "net balance", "outstanding",
  ],
  studentName: [
    "name", "student name", "studentname", "full name", "fullname",
    "pupil name", "learner name",
  ],
  ignore: [],
};

/**
 * Normalises a raw header string: lowercase, collapse whitespace, trim.
 */
export function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Suggests a canonical field for a given raw header string.
 * Returns "ignore" if no alias matches.
 */
export function suggestField(rawHeader: string): CanonicalField {
  const norm = normaliseHeader(rawHeader);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [CanonicalField, string[]][]) {
    if (aliases.includes(norm)) return field;
  }
  return "ignore";
}

/**
 * Builds an auto-suggested ColumnMapping from an array of raw header strings.
 * The bursar can then confirm/override each suggestion in the UI.
 */
export function buildSuggestedMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    mapping[header] = suggestField(header);
  }
  return mapping;
}

/**
 * Applies a confirmed ColumnMapping to a raw data row (keyed by original header),
 * returning a typed ImportRow. Returns null if required fields are missing.
 *
 * Required fields: admissionNumber + (amount OR balance)
 */
export function applyMapping(
  rawRow: Record<string, string>,
  mapping: ColumnMapping
): ImportRow | null {
  const row: Partial<ImportRow> = {};

  for (const [header, field] of Object.entries(mapping)) {
    const raw = (rawRow[header] ?? "").trim();
    if (!raw || field === "ignore") continue;

    switch (field) {
      case "admissionNumber":
        row.admissionNumber = raw;
        break;

      case "amount": {
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
        if (!isNaN(num)) row.amount = num;
        break;
      }

      case "balance": {
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
        if (!isNaN(num)) row.balance = num;
        break;
      }

      case "date": {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) row.date = d;
        break;
      }

      case "description":
        row.description = raw;
        break;

      case "paymentMethod":
        row.paymentMethod = raw.toUpperCase();
        break;

      case "reference":
        row.reference = raw;
        break;

      case "studentName":
        // Informational only — not written to ImportRow
        break;
    }
  }

  // Validate: admissionNumber is always required
  if (!row.admissionNumber) return null;
  // At least one of amount / balance must be present
  if (row.amount === undefined && row.balance === undefined) return null;

  // Ensure amount is set (use balance as fallback for opening-balance imports)
  if (row.amount === undefined && row.balance !== undefined) {
    row.amount = row.balance;
  }

  return row as ImportRow;
}

/**
 * Returns a downloadable template CSV string for the given import type.
 */
export function buildTemplateCsv(importType: "PLAIN_LEDGER" | "OPENING_BALANCE"): string {
  if (importType === "OPENING_BALANCE") {
    return [
      "Admission Number,Student Name,Opening Balance,Description",
      "ADM001,John Doe,15000,Balance carried forward from previous system",
    ].join("\n");
  }

  // PLAIN_LEDGER
  return [
    "Admission Number,Student Name,Amount,Date,Payment Method,Reference,Description",
    "ADM001,John Doe,5000,2024-01-15,MPESA,QBC123XYZ,Term 1 payment",
  ].join("\n");
}
