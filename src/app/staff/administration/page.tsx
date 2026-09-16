import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { FileText } from "lucide-react";

/**
 * The sidebar's Administration hub links here for every role, but this route
 * never existed under /staff — so it 404'd for anyone granted the REPORTS
 * module (e.g. a teacher with Full Admin Access). System Settings stays
 * Principal-only by design (there is no permission module backing it, same
 * as Staff Roles & Permissions), so this only ever surfaces Reports.
 */
export default async function StaffAdministrationHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  if (!perms.REPORTS?.canView && !perms.REPORTS?.canManage) redirect("/staff");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">
        Administration
      </h1>
      <p className="text-slate text-sm mb-8">
        Reports and analytics.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <Link
          href="/staff/reports"
          className="group bg-card border border-border rounded-xl p-6
                     hover:border-teal/40 hover:shadow-md transition-all duration-150 dark:hover:border-teal/30"
        >
          <div className="flex items-start gap-4 mb-3">
            <div className="rounded-lg bg-teal/10 p-2.5 shrink-0 group-hover:bg-teal/15 transition-colors">
              <FileText className="h-5 w-5 text-teal" />
            </div>
            <h2 className="text-lg font-semibold text-foreground
                           group-hover:text-teal transition-colors pt-1">
              Reports
            </h2>
          </div>
          <p className="text-slate text-sm leading-relaxed">
            Print and export academic reports, report cards, and financial reports.
          </p>
        </Link>
      </div>
    </div>
  );
}
