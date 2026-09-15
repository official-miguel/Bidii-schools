import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getEnabledOptionalModules } from "@/lib/moduleAccess";

/**
 * /teacher/accommodation — Student Life hub landing page.
 *
 * The HubSidebar uses `seg: "accommodation"` for the Student Life hub,
 * so this is the first page a teacher sees when they click the star icon.
 * It shows Records (Discipline + Achievements), which is core, and
 * Accommodation, which is dropped when the school does not have that module.
 */
export default async function TeacherStudentLifePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const enabledModules = user.schoolId
    ? await getEnabledOptionalModules(user.schoolId)
    : null;

  const allTiles = [
    {
      href: "/teacher/records/discipline",
      icon: BookOpen,
      title: "Records",
      description: "View and manage discipline cases and student achievement records.",
      color: "teal",
    },
    {
      href: "/teacher/accommodation-details",
      icon: Building2,
      title: "Accommodation",
      description: "Browse dormitories, room assignments, and boarding student details.",
      color: "violet",
      module: "ACCOMMODATION",
    },
  ] as const;

  const tiles = allTiles.filter(
    (tile) =>
      !("module" in tile) || !enabledModules || enabledModules.has(tile.module)
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">Student Life</h1>
      <p className="text-slate text-sm mb-8">
        {tiles.length > 1
          ? "Access student records and boarding accommodation."
          : "Access student records."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl">
        {tiles.map(({ href, icon: Icon, title, description, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6
                       shadow-sm transition-shadow hover:shadow-md
                      "
          >
            {/* Icon bubble */}
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl
                ${color === "teal"
                  ? "bg-teal/10 text-teal"
                  : "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                }`}
            >
              <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden />
            </div>

            {/* Text */}
            <div>
              <p className="font-semibold text-foreground group-hover:text-teal transition-colors dark:group-hover:text-teal">
                {title}
              </p>
              <p className="mt-1 text-sm text-slate leading-snug">
                {description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
