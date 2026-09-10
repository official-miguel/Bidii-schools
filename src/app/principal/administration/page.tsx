import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FileText, Settings } from "lucide-react";

const MODULES = [
  {
    href: "/principal/reports",
    icon: FileText,
    label: "Reports",
    description:
      "Print and export academic reports, report cards, accommodation summaries, attendance records, and student conduct.",
  },
  {
    href: "/principal/settings",
    icon: Settings,
    label: "System Settings",
    description:
      "API integrations, AI configuration, teacher ranking weights, library borrowing rules, and accommodation settings.",
  },
];

export default async function PrincipalAdministrationHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">
        Administration
      </h1>
      <p className="text-slate text-sm mb-8">
        Reports and system-wide configuration.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {MODULES.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="group bg-card border border-border rounded-xl p-6
                       hover:border-teal/40 hover:shadow-md transition-all duration-150 dark:hover:border-teal/30"
          >
            <div className="flex items-start gap-4 mb-3">
              <div className="rounded-lg bg-teal/10 p-2.5 shrink-0 group-hover:bg-teal/15 transition-colors">
                <Icon className="h-5 w-5 text-teal" />
              </div>
              <h2 className="text-lg font-semibold text-foreground
                             group-hover:text-teal transition-colors pt-1">
                {label}
              </h2>
            </div>
            <p className="text-slate text-sm leading-relaxed">
              {description}
            </p>
            <div className="mt-4 text-teal text-sm font-medium opacity-0 group-hover:opacity-100
                            transition-opacity">
              Open {label} →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
