/**
 * src/lib/soma-ai/system-map.ts
 *
 * Turns the generated route map into a compact, role-scoped outline of the
 * whole application for Soma AI.
 *
 * The curated help KB in help-content.ts gives precise step-by-step answers,
 * but only covers a handful of tasks. Without anything else, Soma has to
 * refuse every "where do I find X" question about the rest of the app. This
 * module supplies the missing breadth: every real page, grouped by section,
 * so Soma can answer navigation questions for any part of Bidii while still
 * only naming routes that actually exist.
 *
 * It is injected only for navigation/how-to questions — data questions don't
 * pay the token cost.
 */

import { SYSTEM_MAP, type SystemMapRoute } from "./system-map.generated";
import { MODULE_INFO } from "@/lib/moduleInfo";

/** Maps a Soma display role to the route area it browses. */
const ROLE_TO_AREA: Record<string, SystemMapRoute["area"]> = {
  principal: "principal",
  teacher: "teacher",
  staff: "staff",
  parent: "parent",
  student: "student",
};

/**
 * A short description of what each top-level section is for, keyed by the
 * section's URL segment. Sourced from MODULE_INFO so the wording stays in sync
 * with the permission matrix rather than being duplicated here.
 */
function describeSection(segment: string): string | undefined {
  const normalized = segment.replace(/-/g, "_").toUpperCase();
  const direct = MODULE_INFO[normalized as keyof typeof MODULE_INFO];
  if (direct) return direct.description;

  // A few sections don't map 1:1 onto a Module enum value.
  const aliases: Record<string, string> = {
    finance: "School finance: fee structures, invoicing, payments, and reports",
    history: "Archived leavers and graduands",
    people: "Students and staff records",
    academics: "Academic hub: classes, subjects, assessments, and timetable",
    administration: "School settings, roles, and configuration",
    profile: "Your own account details and password",
    notifications: "Your alerts and unread updates",
    messages: "Your message inbox",
    behaviour: "Conduct records",
    results: "Academic results",
    diary: "Assignments, homework, and subject announcements",
  };
  return aliases[segment];
}

/** "/principal/assessments" → "assessments" */
function sectionSegment(section: string): string {
  const parts = section.split("/").filter(Boolean);
  return parts.length > 1 ? parts[1] : parts[0] ?? "";
}

/**
 * Builds a markdown outline of every page this role can reach.
 *
 * Detail pages ([id] routes) are folded into a single note per section rather
 * than listed individually — a user navigates to them by picking a record, so
 * listing the raw parameterised path would only invite Soma to quote a URL
 * nobody can type.
 */
export function buildSystemMap(role: string): string {
  const area = ROLE_TO_AREA[role.toLowerCase()];
  if (!area) return "";

  const routes = SYSTEM_MAP.filter((r) => r.area === area);
  if (routes.length === 0) return "";

  // Group by section, preserving route order (already sorted alphabetically).
  const sections = new Map<string, SystemMapRoute[]>();
  for (const route of routes) {
    const list = sections.get(route.section) ?? [];
    list.push(route);
    sections.set(route.section, list);
  }

  const blocks: string[] = [];
  for (const [section, entries] of sections) {
    const segment = sectionSegment(section);
    const heading = segment
      ? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
      : "Home";
    const description = describeSection(segment);

    const listed = entries.filter((e) => !e.detail);
    const hasDetailPages = entries.some((e) => e.detail);

    const lines = listed.map((e) => `  - ${e.label} — \`${e.route}\``);
    if (hasDetailPages) {
      lines.push("  - (individual records open from the lists above)");
    }

    blocks.push(
      `**${heading}**${description ? ` — ${description}` : ""}\n${lines.join("\n")}`
    );
  }

  return blocks.join("\n\n");
}

/**
 * Wraps the map in the instructions Soma needs to use it safely: answer freely
 * about anything listed, but never invent a page that isn't.
 */
export function formatSystemMapContext(role: string): string {
  const map = buildSystemMap(role);
  if (!map) return "";

  return `## Complete page map for this user's role
Every page this user can open is listed below, with its exact URL path. Use it
to answer any "where do I find…", "how do I get to…", or "what can I do here"
question — name the section and page, and quote the path exactly as written.

If something a user asks about is NOT in this list, say you can't find that
feature rather than guessing at a page name or path.

${map}`;
}
