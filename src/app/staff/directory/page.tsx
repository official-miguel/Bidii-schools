import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Users,
  BookOpen,
  Building2,
  GraduationCap,
  Mail,
  Phone,
  ClipboardList,
} from "lucide-react";
import { Avatar, Chip } from "@/components/ui";

export default async function StaffDirectoryPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN_STAFF" && user.role !== "BURSAR")) redirect("/login");

  const teachers = await prisma.teacher.findMany({
    where:   { schoolId: user.schoolId! },
    orderBy: { fullName: "asc" },
    include: {
      primaryDepartment: { select: { name: true } },
      classTeacherOf:    { select: { name: true } },
      user: { select: { role: true, isActive: true, mustChangePassword: true, staffRole: { select: { name: true } } } },
    },
  });

  function roleLabel(t: (typeof teachers)[number]) {
    if (!t.user) return "No account";
    if (t.user.mustChangePassword) return "Never logged in";
    if (t.user.staffRole) return t.user.staffRole.name;
    return t.user.role === "TEACHER" ? "Teacher" : t.user.role;
  }

  // Group by department for the breakdown table
  const byDept = new Map<string, typeof teachers>();
  for (const t of teachers) {
    const dept = t.primaryDepartment?.name ?? "Other";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(t);
  }
  const deptEntries = Array.from(byDept.entries()).sort(([a], [b]) => a.localeCompare(b));

  const teachingStaff    = teachers.filter((t) => !t.user?.staffRole);
  const nonTeachingStaff = teachers.filter((t) => t.user?.staffRole);

  const stats = [
    { label: "Total staff",    value: teachers.length,         Icon: Users },
    { label: "Teaching",       value: teachingStaff.length,    Icon: BookOpen },
    { label: "Non-teaching",   value: nonTeachingStaff.length, Icon: Building2 },
    { label: "Departments",    value: byDept.size - (byDept.has("Other") ? 1 : 0), Icon: GraduationCap },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Staff</h1>
        <p className="text-sm text-slate mt-1">
          {teachers.length} staff member{teachers.length !== 1 ? "s" : ""} registered
          {nonTeachingStaff.length > 0 && ` · ${nonTeachingStaff.length} non-teaching`}
        </p>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <Users className="h-10 w-10 text-slate mx-auto mb-3" aria-hidden="true" />
          <p className="text-base font-medium text-foreground mb-1">No staff registered yet</p>
          <p className="text-sm text-slate">Ask the principal to register staff members.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Quick stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map(({ label, value, Icon }) => (
              <div
                key={label}
                className="bg-card border border-border rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{value}</span>
                </div>
                <p className="text-xs text-slate">{label}</p>
              </div>
            ))}
          </div>

          {/* Staff cards — grouped by section */}
          {[
            { title: "Teaching Staff",     list: teachingStaff },
            { title: "Non-Teaching Staff", list: nonTeachingStaff },
          ]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <div key={group.title}>
                <h2 className="text-base font-semibold text-foreground mb-3">
                  {group.title}
                  <span className="ml-2 text-sm font-normal text-slate">
                    ({group.list.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.list.map((t) => (
                    <div
                      key={t.id}
                      className="bg-card border border-border rounded-xl p-4 shadow-sm
                                 hover:border-teal/40 hover:shadow-md transition-all duration-150 dark:hover:border-teal/30"
                    >
                      {/* Avatar + name */}
                      <div className="flex items-start gap-3">
                        <Avatar name={t.fullName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {t.fullName}
                          </p>
                          <p className="text-xs text-slate font-mono">
                            #{t.staffId}
                          </p>
                        </div>
                        <Chip
                          variant={t.user?.staffRole ? "info" : "teal"}
                          size="xs"
                          className="shrink-0"
                        >
                          {roleLabel(t)}
                        </Chip>
                      </div>

                      {/* Details */}
                      <div className="mt-3 space-y-1.5">
                        {t.primaryDepartment && (
                          <p className="text-xs text-slate flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 shrink-0 text-slate/60" aria-hidden="true" />
                            {t.primaryDepartment.name}
                          </p>
                        )}
                        {t.classTeacherOf && (
                          <p className="text-xs text-slate flex items-center gap-1.5">
                            <ClipboardList className="h-3 w-3 shrink-0 text-slate/60" aria-hidden="true" />
                            Class teacher — {t.classTeacherOf.name}
                          </p>
                        )}
                        {t.email && (
                          <p className="text-xs text-slate flex items-center gap-1.5 truncate">
                            <Mail className="h-3 w-3 shrink-0 text-slate/60" aria-hidden="true" />
                            <a
                              href={`mailto:${t.email}`}
                              className="hover:text-teal truncate transition-colors"
                            >
                              {t.email}
                            </a>
                          </p>
                        )}
                        {t.phone && (
                          <p className="text-xs text-slate flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0 text-slate/60" aria-hidden="true" />
                            <a
                              href={`tel:${t.phone}`}
                              className="hover:text-teal transition-colors"
                            >
                              {t.phone}
                            </a>
                          </p>
                        )}
                      </div>

                      {/* Inactive badge */}
                      {t.user && !t.user.isActive && (
                        <div className="mt-3 text-xs text-warn bg-warn-bg rounded-md px-2 py-1 border border-warn/20">
                          Login inactive
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* Department breakdown */}
          {deptEntries.length > 1 && (
            <div>
              <h2 className="text-base font-semibold text-foreground mb-3">
                By Department
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/60/40">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                        Department
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                        Staff
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide hidden sm:table-cell">
                        Members
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptEntries.map(([dept, members]) => (
                      <tr
                        key={dept}
                        className="border-b border-border last:border-0 hover:bg-background/50 transition-colors/30"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{dept}</td>
                        <td className="px-4 py-3 text-slate">{members.length}</td>
                        <td className="px-4 py-3 text-slate text-xs hidden sm:table-cell">
                          {members.slice(0, 4).map((m) => m.fullName.split(" ")[0]).join(", ")}
                          {members.length > 4 && ` +${members.length - 4} more`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
