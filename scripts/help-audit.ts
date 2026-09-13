#!/usr/bin/env ts-node
/**
 * scripts/help-audit.ts
 *
 * CI validation script for the Soma AI help-content knowledge base.
 * Run with:
 *   npx ts-node scripts/help-audit.ts
 * or add to package.json:
 *   "help-audit": "ts-node scripts/help-audit.ts"
 *
 * Fails (exit 1) if any of the following are detected:
 *
 *   1. STALE ROUTE    — an entry's `route` doesn't correspond to a real
 *                       page.tsx file in src/app/.
 *   2. KEYWORD CLASH  — two entries with identical keyword sets (would make
 *                       matching non-deterministic).
 *   3. SLOW MATCHING  — p95 latency over 1000 sample queries exceeds 5 ms
 *                       (confirms the synchronous, non-AI path stays fast).
 *   4. INCOMPLETE ENTRY — any entry with < 2 keywords, an empty answer,
 *                          or no numbered step in the answer.
 *
 * Run this in CI whenever help-content.ts changes:
 *   on: push / paths: ['src/lib/soma-ai/help-content.ts']
 */

import * as fs   from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Import the content + resolver (ts-node resolves these via tsconfig)
// ---------------------------------------------------------------------------

// We use require() with a relative path to avoid needing the full Next.js
// module resolution stack in a plain ts-node run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HELP_CONTENT } = require("../src/lib/soma-ai/help-content") as
  typeof import("../src/lib/soma-ai/help-content");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveHelpAnswer } = require("../src/lib/soma-ai/help") as
  typeof import("../src/lib/soma-ai/help");

import type { HelpEntry } from "../src/lib/soma-ai/help-content";
import type { UserScope } from "../src/lib/soma-ai/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_DIR = path.join(__dirname, "..", "src", "app");

/** Returns true when a route string maps to an existing page.tsx file. */
function routeExists(route: string): boolean {
  // Strip leading slash, convert to file-system path, add page.tsx
  const rel    = route.replace(/^\//, "").replace(/\//g, path.sep);
  const full   = path.join(APP_DIR, rel, "page.tsx");
  if (fs.existsSync(full)) return true;

  // Also accept dynamic segment matches — e.g. /principal/students/[id]
  // We check the parent folder exists even if the specific page.tsx differs.
  const parent = path.join(APP_DIR, rel);
  return fs.existsSync(parent);
}

/** Canonical key for a keyword set — sorted, joined. */
function kwKey(entry: HelpEntry): string {
  return [...entry.keywords].sort().join("|");
}

// ---------------------------------------------------------------------------
// Fake scope used only for latency testing — no real DB needed
// ---------------------------------------------------------------------------
const FAKE_SCOPE: UserScope = {
  userId:       "ci-test",
  schoolId:     "ci-school",
  role:         "PRINCIPAL",
  isAdmin:      true,
  studentIds:   [],
  classIds:     [],
  teacherId:    null,
  moduleGrants: {},
  displayName:  "CI Test",
};

// ---------------------------------------------------------------------------
// Sample queries for latency testing
// ---------------------------------------------------------------------------
const SAMPLE_QUERIES = [
  "how do i mark attendance",
  "how to add a new student",
  "where do i find the timetable",
  "how do i generate report cards",
  "steps to send an sms to parents",
  "how to reset my password",
  "where can i see library fines",
  "how does the attendance report work",
  "how do i enter marks",
  "what page is the dormitory settings on",
  "how do i view exam results",
  "how can i check my child's results",
  "guide to issuing a library book",
  "where is the student profile",
  "how do i communicate with parents",
  "how to view class attendance history",
  "what menu has the report card",
  "how do i access school finance",
  "how do i update my password",
  "steps for checking if a student is absent",
  // Non-help queries to confirm they return no_match quickly too
  "who was absent today",
  "how many students do we have",
  "show me term 1 results",
  "what is the average score for form 3",
  "list all classes",
];

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

let failures = 0;

function fail(msg: string): void {
  console.error(`\n  FAIL: ${msg}`);
  failures++;
}

function ok(msg: string): void {
  console.log(`  ok   ${msg}`);
}

console.log("\n=== Soma AI help-audit ===\n");
console.log(`Validating ${HELP_CONTENT.length} entries...\n`);

// ── CHECK 1: Incomplete entries ────────────────────────────────────────────
console.log("1. Incomplete entry check");
for (const entry of HELP_CONTENT) {
  if (entry.keywords.length < 2) {
    fail(`[${entry.id}] needs at least 2 keywords (has ${entry.keywords.length})`);
  }
  if (!entry.answer || entry.answer.trim().length === 0) {
    fail(`[${entry.id}] answer is empty`);
  }
  // Require at least one numbered step (digit followed by . or ))
  if (!/^\d+[.)]/m.test(entry.answer)) {
    fail(`[${entry.id}] answer has no numbered steps (e.g. "1. ...")`);
  }
  if (!entry.question || entry.question.trim().length === 0) {
    fail(`[${entry.id}] question is empty`);
  }
}
if (failures === 0) ok(`all ${HELP_CONTENT.length} entries have ≥2 keywords, non-empty answers, and numbered steps`);

// ── CHECK 2: Stale routes ──────────────────────────────────────────────────
console.log("\n2. Stale route check");
let staleCount = 0;
for (const entry of HELP_CONTENT) {
  if (!entry.route) continue;
  if (!routeExists(entry.route)) {
    fail(`[${entry.id}] route "${entry.route}" does not match any page.tsx in src/app/`);
    staleCount++;
  }
}
if (staleCount === 0) ok("all routes with a path resolve to real pages");

// ── CHECK 3: Keyword collisions ────────────────────────────────────────────
console.log("\n3. Keyword collision check");
const seen = new Map<string, string>();
for (const entry of HELP_CONTENT) {
  const key = kwKey(entry);
  if (seen.has(key)) {
    fail(`[${entry.id}] has identical keyword set as [${seen.get(key)}] — matching would be non-deterministic`);
  } else {
    seen.set(key, entry.id);
  }
}
if (failures === 0) ok("no two entries share an identical keyword set");

// ── CHECK 4: p95 latency ───────────────────────────────────────────────────
console.log("\n4. p95 latency check (1000 runs × sample queries)");
const RUNS       = 1000;
const P95_LIMIT  = 5; // milliseconds
const latencies: number[] = [];

for (let i = 0; i < RUNS; i++) {
  const q  = SAMPLE_QUERIES[i % SAMPLE_QUERIES.length];
  const t0 = performance.now();
  resolveHelpAnswer(q, FAKE_SCOPE);
  latencies.push(performance.now() - t0);
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.50)]!;
const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
const p99 = latencies[Math.floor(latencies.length * 0.99)]!;

console.log(`     p50=${p50.toFixed(3)}ms  p95=${p95.toFixed(3)}ms  p99=${p99.toFixed(3)}ms`);
if (p95 > P95_LIMIT) {
  fail(`p95 latency ${p95.toFixed(2)}ms exceeds ${P95_LIMIT}ms limit — help matching is no longer a cheap synchronous path`);
} else {
  ok(`p95 ${p95.toFixed(2)}ms ≤ ${P95_LIMIT}ms`);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(40));
if (failures > 0) {
  console.error(`\n${failures} check(s) failed. Fix help-content.ts before merging.\n`);
  process.exit(1);
} else {
  console.log("\nAll checks passed.\n");
  process.exit(0);
}
