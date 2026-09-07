#!/usr/bin/env node
/**
 * scripts/check-raw-sql.mjs
 *
 * Fails (exit 1) if any TypeScript source file under src/ contains a call to
 * $queryRawUnsafe or $executeRawUnsafe that is NOT accompanied by a
 * "// SAFE:" comment on the same line or the immediately preceding line.
 *
 * This prevents new unreviewed raw-SQL calls from being introduced silently.
 * To legitimately use these APIs:
 *   1. Confirm the dynamic SQL structure (not just values) truly cannot be
 *      expressed as a Prisma tagged-template or $queryRaw call.
 *   2. Add a comment directly above (or on) the call explaining why it is safe:
 *        // SAFE: VALUES list length varies at runtime; all values are $N-bound.
 *        await tx.$executeRawUnsafe(`INSERT … VALUES ${placeholders}`, ...args);
 *
 * Run via `npm run check:raw-sql` or as part of `npm run predeploy`.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, resolve } from "path";

const SRC_DIR   = resolve(process.cwd(), "src");
const UNSAFE_RE = /\$(queryRawUnsafe|executeRawUnsafe)\b/;
const SAFE_RE   = /\/\/\s*SAFE:/;

function walkTs(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...walkTs(full));
    else if (e.isFile() && (extname(e.name) === ".ts" || extname(e.name) === ".tsx"))
      files.push(full);
  }
  return files;
}

const violations = [];

for (const file of walkTs(SRC_DIR)) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip if the match is inside a comment (JSDoc or inline)
    if (/^\s*\*/.test(line) || /^\s*\/\//.test(line)) continue;
    if (!UNSAFE_RE.test(line)) continue;
    // Accept if the call line itself has // SAFE:
    if (SAFE_RE.test(line)) continue;
    // Accept if any of the previous 10 non-blank lines have // SAFE:
    let found = false;
    let lookback = 0;
    for (let j = i - 1; j >= 0 && lookback < 10; j--) {
      if (lines[j].trim() === "") continue;
      lookback++;
      if (SAFE_RE.test(lines[j])) { found = true; break; }
      // Stop scanning back if we hit a line that isn't a comment
      if (!/^\s*\/\//.test(lines[j])) break;
    }
    if (found) continue;
    // Violation
    violations.push(`  ${file}:${i + 1}  →  ${line.trim()}`);
  }
}

if (violations.length > 0) {
  console.error(
    "\n❌  RAW SQL CHECK FAILED: unguarded $queryRawUnsafe/$executeRawUnsafe calls:\n\n" +
    violations.join("\n") +
    "\n\n   Add a '// SAFE: <reason>' comment above each call explaining why it\n" +
    "   cannot be converted to a parameterized $queryRaw/$executeRaw call.\n"
  );
  process.exit(1);
}

console.log("✅  Raw SQL check passed — all $*Unsafe calls have SAFE comments.");
