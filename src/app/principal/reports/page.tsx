import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import {
  FileText,
  Printer,
  GraduationCap,
  BedDouble,
  Users,
  CalendarDays,
  ShieldAlert,
  Trophy,
  BarChart2,
  ClipboardList,
  BookOpen,
  ArrowRight,
} from "lucide-react";

// ── Report category + item types ──────────────────────────────────────────────

interface ReportItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  print?: boolean;   // opens in new tab (print destination)
  badge?: string;
}

interface ReportCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  items: ReportItem[];
}

const CATEGORIES: ReportCategory[] = [
  {
    id: "academic",
    label: "Academic Reports",
    icon: GraduationCap,
    description: "Report cards, mark sheets, and class performance summaries.",
    items: [
      {
        href: "/principal/assessments/report-cards",
        icon: FileText,
        label: "Report Cards",
        description:
          "Generate and print individual or class-wide report cards. Supports 8-4-4 and CBE frameworks — auto-detected per class.",
      },
      {
        href: "/principal/assessments/report-cards-cbe",
        icon: FileText,
        label: "CBE Report Cards",
        description:
          "CBE-specific report card generator. Junior and Senior CBE templates, print all or individual students.",
        badge: "CBE",
      },
      {
        href: "/principal/assessments/marksheet",
        icon: ClipboardList,
        label: "Mark Sheet",
        description:
          "View and enter student marks by class and subject. Exportable for each assessment period.",
      },
      {
        href: "/principal/assessments/dashboard",
        icon: BarChart2,
        label: "Assessment Dashboard",
        description:
          "School-wide performance overview — class means, completion rates, and trend charts by period.",
      },
    ],
  },
  {
    id: "staff",
    label: "Staff Reports",
    icon: Users,
    description: "Teacher performance rankings and departmental analytics.",
    items: [
      {
        href: "/principal/assessments/staff-performance",
        icon: BarChart2,
        label: "Staff Performance",
        description:
          "Teacher ranking by composite score — entry completion rate, score improvement, and class mean. Printable league table.",
      },
      {
        href: "/principal/assessments/dept-analytics",
        icon: BarChart2,
        label: "Department Analytics",
        description:
          "Subject breakdown, cross-term trend lines, and class performance heatmap by department.",
      },
    ],
  },
  {
    id: "attendance",
    label: "Attendance Reports",
    icon: CalendarDays,
    description: "Class and school-wide attendance summaries.",
    items: [
      {
        href: "/principal/attendance",
        icon: CalendarDays,
        label: "Attendance Overview",
        description:
          "Daily and weekly attendance rates by class. Filter by date range and export attendance analytics.",
      },
    ],
  },
  {
    id: "accommodation",
    label: "Accommodation Reports",
    icon: BedDouble,
    description: "Dormitory occupancy, allocations, and boarding population.",
    items: [
      {
        href: "/principal/accommodation/reports",
        icon: BedDouble,
        label: "Occupancy Report",
        description:
          "Capacity, occupancy rate, and availability for every dormitory. CSV export and print.",
      },
      {
        href: "/principal/accommodation/reports",
        icon: Users,
        label: "Students by Dormitory",
        description:
          "Full list of allocated students with dormitory, cubicle, and bed details.",
      },
      {
        href: "/principal/accommodation/reports",
        icon: BarChart2,
        label: "Boarding Population",
        description:
          "Boarding vs day students per class with percentages. Export to CSV.",
      },
      {
        href: "/principal/accommodation/reports",
        icon: ArrowRight,
        label: "Movement History",
        description:
          "Allocation, transfer, and vacation events over a selected date range.",
      },
    ],
  },
  {
    id: "conduct",
    label: "Conduct & Recognition",
    icon: ShieldAlert,
    description: "Discipline case reports and student achievement records.",
    items: [
      {
        href: "/principal/records/discipline",
        icon: ShieldAlert,
        label: "Discipline Report",
        description:
          "Student discipline cases — incidents, status, resolutions, and case notes. Filter by class, date, or severity.",
      },
      {
        href: "/principal/records/achievements",
        icon: Trophy,
        label: "Achievements Report",
        description:
          "Recognised student achievements across sports, academics, leadership, and co-curricular activities.",
      },
    ],
  },
  {
    id: "library",
    label: "Library Reports",
    icon: BookOpen,
    description: "Borrowing activity, overdue books, and fine summaries.",
    items: [
      {
        href: "/principal/library",
        icon: BookOpen,
        label: "Library Overview",
        description:
          "Catalogue size, copies in circulation, overdue count, and outstanding fines at a glance.",
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default async function PrincipalReportsHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start gap-3 mb-8">
        <div className="rounded-lg bg-teal/10 p-2.5 shrink-0 mt-0.5">
          <Printer className="h-5 w-5 text-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-slate text-sm mt-1">
            All printable and exportable reports in one place. Select a report to open it.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-10">
        {CATEGORIES.map(({ id, label, icon: CatIcon, description, items }) => (
          <section key={id}>
            {/* Category header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="rounded-md bg-teal/8 p-1.5">
                <CatIcon className="h-4 w-4 text-teal" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">{label}</h2>
                <p className="text-xs text-slate">{description}</p>
              </div>
            </div>

            {/* Report tiles */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(({ href, icon: Icon, label: itemLabel, description: itemDesc, print, badge }) => (
                <Link
                  key={`${id}-${href}-${itemLabel}`}
                  href={href}
                  target={print ? "_blank" : undefined}
                  rel={print ? "noopener noreferrer" : undefined}
                  className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4
                             hover:border-teal/40 hover:shadow-sm transition-all duration-150 dark:hover:border-teal/30"
                >
                  <div className="rounded-lg bg-teal/10 p-2 shrink-0 mt-0.5
                                  group-hover:bg-teal/15 transition-colors">
                    <Icon className="h-4 w-4 text-teal" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-semibold text-foreground
                                   group-hover:text-teal transition-colors leading-tight">
                        {itemLabel}
                      </p>
                      {badge && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                                         font-semibold bg-teal/10 text-teal border border-teal/20">
                          {badge}
                        </span>
                      )}
                      {print && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
                                         text-[10px] font-medium bg-slate/8 text-slate border border-border">
                          <Printer className="h-2.5 w-2.5" aria-hidden="true" />
                          Print
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate leading-relaxed">
                      {itemDesc}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-slate/40 shrink-0 mt-1
                               group-hover:text-teal group-hover:translate-x-0.5
                               transition-all/40"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
