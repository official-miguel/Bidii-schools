#!/usr/bin/env node
/**
 * scripts/check-secrets.mjs
 *
 * Fails (exit 1) if:
 *   - A .env file (not .env.example / .env.template / .env.*.example) is
 *     staged in git, OR
 *   - Any .env file is found in common build-artifact directories
 *     (.next/, out/, build/, dist/).
 *
 * Run via `npm run predeploy` or in CI before `npm run build`.
 * The check uses plain Node.js built-ins — no extra dependencies.
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ── 1. Check git staged files ─────────────────────────────────────────────────
// Pattern: any file whose basename is exactly ".env" or starts with ".env."
// but is NOT an example/template file.
const SAFE_SUFFIXES = [".example", ".template", ".sample"];
const ENV_PATTERN   = /(?:^|\/)\.env(\..+)?$/;

let staged = [];
try {
  const output = execSync("git diff --cached --name-only", { encoding: "utf8" });
  staged = output.split("\n").filter(Boolean);
} catch {
  // Not a git repo or git not installed — skip staged-file check.
  console.warn("[check-secrets] Could not run git diff — skipping staged-file check.");
}

const stagedSecrets = staged.filter((f) => {
  if (!ENV_PATTERN.test(f)) return false;
  return !SAFE_SUFFIXES.some((s) => f.endsWith(s));
});

if (stagedSecrets.length > 0) {
  console.error(
    "\n❌  SECRETS CHECK FAILED: the following .env files are staged for commit:\n" +
    stagedSecrets.map((f) => `   • ${f}`).join("\n") +
    "\n\n   Unstage them with:  git restore --staged <file>\n" +
    "   Then add them to .gitignore and rotate any exposed credentials.\n"
  );
  process.exit(1);
}

// ── 2. Check build-artifact directories ──────────────────────────────────────
const ARTIFACT_DIRS = [".next", "out", "build", "dist"];

function findEnvFilesIn(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findEnvFilesIn(full));
    } else if (ENV_PATTERN.test(entry.name) && !SAFE_SUFFIXES.some((s) => entry.name.endsWith(s))) {
      found.push(full);
    }
  }
  return found;
}

const artifactSecrets = ARTIFACT_DIRS.flatMap(findEnvFilesIn);

if (artifactSecrets.length > 0) {
  console.error(
    "\n❌  SECRETS CHECK FAILED: .env files found in build-artifact directories:\n" +
    artifactSecrets.map((f) => `   • ${f}`).join("\n") +
    "\n\n   Remove them and ensure your build process never copies .env into artifacts.\n"
  );
  process.exit(1);
}

console.log("✅  Secrets check passed — no .env files staged or in build artifacts.");
