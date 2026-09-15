import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getEnabledOptionalModules } from "@/lib/moduleAccess";

/**
 * /principal/accommodation — Student Life hub landing page.
 *
 * Despite the path, this is the hub, not the accommodation module: the sidebar
 * uses `seg: "accommodation"` for Student Life, so this is the first page shown
 * when the star icon is clicked. It links out to both Accommodation and
 * Conduct & Recognition.
 *
 * Conduct & Recognition is core and always listed. Accommodation is optional
 * per school, so its tile is dropped entirely when a super admin has switched
 * the module off — leaving a hub with just the records tile rather than a link
 * into a section that no longer exists.
 */

// ── Hub tiles ─────────────────────────────────────────────────────────────────

const STUDENT_LIFE_TILES = [
  {
    href: "/principal/accommodation/overview",
    icon: Building2,
    label: "Accommodation",
    description: "Dormitories, boarding allocations, occupancy, and inspections.",
    cta: "Manage Accommodation →",
    /** Hidden when the school does not have the Accommodation module. */
    module: "ACCOMMODATION" as const,
  },
  {
    href: "/principal/records/discipline",
    icon: ShieldAlert,
    label: "Conduct & Recognition",
    description: "Discipline records, achievements, and student recognition.",
    cta: "View Records →",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StudentLifeHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const enabledModules = user.schoolId
    ? await getEnabledOptionalModules(user.schoolId)
    : null;

  const tiles = STUDENT_LIFE_TILES.filter(
    (tile) => !tile.module || !enabledModules || enabledModules.has(tile.module)
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">Student Life</h1>
      <p className="text-slate text-sm mb-8">
        {tiles.length > 1
          ? "Boarding accommodation, conduct records, and student recognition."
          : "Conduct records and student recognition."}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {tiles.map(({ href, icon: Icon, label, description, cta }) => (
          <div
            key={href}
            className="bg-card border border-border rounded-xl p-6
                       hover:border-teal/40 hover:shadow-sm transition-all duration-150 dark:hover:border-teal/30"
          >
            <div className="flex items-start gap-4 mb-3">
              <div className="rounded-lg bg-teal/10 p-2.5 shrink-0">
                <Icon className="h-5 w-5 text-teal" />
              </div>
              <h2 className="text-lg font-semibold text-foreground pt-1">{label}</h2>
            </div>
            <p className="text-slate text-sm mb-4">{description}</p>
            <Link
              href={href}
              className="text-teal hover:text-teal-dark font-medium text-sm transition-colors"
            >
              {cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
