#!/usr/bin/env ts-node
/**
 * scripts/generate-system-map.ts
 *
 * Generates src/lib/soma-ai/system-map.generated.ts from the real Next.js
 * route tree.
 *
 * Why generate instead of hand-maintaining: Soma AI has to answer "where do I
 * find X" for every page in Bidii. Writing that list by hand means it is wrong
 * the first time someone adds or renames a page. The route tree is the only
 * source of truth that cannot drift from what users actually see, so we read
 * it directly and let Soma quote from the result.
 *
 * Run after adding/renaming/removing pages:
 *   npm run generate:system-map
 */

import * as fs from "fs";
import * as path from "path";

const APP_DIR = path.join(__dirname, "..", "src", "app");
const OUT_FILE = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "soma-ai",
  "system-map.generated.ts"
);

/** Top-level segments that represent a signed-in role area we map for Soma. */
const ROLE_AREAS = ["principal", "teacher", "staff", "parent", "student"] as const;
type RoleArea = (typeof ROLE_AREAS)[number];

interface RouteNode {
  route: string;
  area: RoleArea;
  label: string;
  /** Parent route, for grouping sub-pages under their section. */
  section: string;
  /** True for [param] detail pages reached by picking a record, not a menu. */
  detail: boolean;
}

/** Recursively collects every page.tsx path under src/app. */
function collectPages(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api" || entry.name === "node_modules") continue;
      collectPages(full, acc);
    } else if (entry.name === "page.tsx") {
      acc.push(full);
    }
  }
  return acc;
}

/** src/app/principal/(module)/foo/page.tsx → /principal/foo */
function toRoute(filePath: string): string {
  const rel = path
    .relative(APP_DIR, filePath)
    .replace(/\\/g, "/")
    .replace(/\/page\.tsx$/, "");
  const segments = rel
    .split("/")
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** "report-cards-cbe" → "Report Cards CBE"; "[studentId]" → "Student" */
function toLabel(segment: string): string {
  if (segment.startsWith("[") && segment.endsWith("]")) {
    const inner = segment.replace(/^\[\.*/, "").replace(/\]$/, "");
    const base = inner.replace(/Id$/i, "");
    return titleCase(base) + " detail";
  }
  return titleCase(segment);
}

function titleCase(s: string): string {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => {
      const upper = w.toUpperCase();
      // Preserve domain acronyms rather than mangling them to "Cbe"/"Tod".
      if (["cbe", "tod", "ai", "sms", "id", "pdf", "kcse"].includes(w.toLowerCase())) {
        return upper;
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function build(): RouteNode[] {
  const pages = collectPages(APP_DIR);
  const nodes: RouteNode[] = [];

  for (const file of pages) {
    const route = toRoute(file);
    const segments = route.split("/").filter(Boolean);
    const area = segments[0] as RoleArea;
    if (!ROLE_AREAS.includes(area)) continue; // skip login/signup/public pages

    const leaf = segments[segments.length - 1];
    const detail = /^\[.*\]$/.test(leaf);

    // Area root (e.g. /principal) is the dashboard for that role.
    const label =
      segments.length === 1 ? "Dashboard (home)" : toLabel(leaf);

    const section =
      segments.length > 2 ? "/" + segments.slice(0, 2).join("/") : "/" + area;

    nodes.push({ route, area, label, section, detail });
  }

  nodes.sort((a, b) => a.route.localeCompare(b.route));
  return nodes;
}

function emit(nodes: RouteNode[]): string {
  const header = `/**
 * src/lib/soma-ai/system-map.generated.ts
 *
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate with: npm run generate:system-map
 *
 * A map of every page in Bidii, derived from the Next.js route tree so it can
 * never drift from the real UI. Soma AI quotes from this when answering
 * "where do I find X" so it names only pages that actually exist.
 *
 * Generated from ${nodes.length} pages.
 */

export interface SystemMapRoute {
  route: string;
  area: "principal" | "teacher" | "staff" | "parent" | "student";
  label: string;
  section: string;
  /** Detail pages opened by selecting a record, not from a menu. */
  detail: boolean;
}

export const SYSTEM_MAP: SystemMapRoute[] = [
`;

  const body = nodes
    .map(
      (n) =>
        `  { route: ${JSON.stringify(n.route)}, area: ${JSON.stringify(
          n.area
        )}, label: ${JSON.stringify(n.label)}, section: ${JSON.stringify(
          n.section
        )}, detail: ${n.detail} },`
    )
    .join("\n");

  return header + body + "\n];\n";
}

const nodes = build();
fs.writeFileSync(OUT_FILE, emit(nodes), "utf8");

const byArea = nodes.reduce<Record<string, number>>((acc, n) => {
  acc[n.area] = (acc[n.area] ?? 0) + 1;
  return acc;
}, {});

console.log(`✓ Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
console.log(`  ${nodes.length} pages mapped:`);
for (const [area, count] of Object.entries(byArea).sort()) {
  console.log(`    ${area.padEnd(12)} ${count}`);
}
