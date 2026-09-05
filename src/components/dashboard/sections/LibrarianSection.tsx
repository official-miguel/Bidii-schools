import Link from "next/link";
import { BookOpen, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

interface Props {
  rolePrefix:        string;
  totalBooks:        number;
  booksOut:          number;
  overdueCount:      number;
  finesOutstanding:  number;
  studentsWithFines: number;
}

export default function LibrarianSection({
  rolePrefix, totalBooks, booksOut, overdueCount, finesOutstanding, studentsWithFines,
}: Props) {
  const libBase = `/${rolePrefix}/library`;

  return (
    <section aria-labelledby="librarian-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="librarian-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          Library
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total titles"  value={totalBooks}   href={`${libBase}/catalogue`}          icon={BookOpen}      color="teal" />
        <StatCard label="Books out"     value={booksOut}     href={`${libBase}?filter=out`}          icon={TrendingUp}    color="info" />
        <StatCard label="Overdue"       value={overdueCount} href={`${libBase}?filter=overdue`}      icon={AlertTriangle}
                  color={overdueCount > 0 ? "danger" : "success"}
                  badge={overdueCount > 0 ? `${overdueCount} overdue` : "All on time"}
                  badgeColor={overdueCount > 0 ? "danger" : "success"} />
        <StatCard label="Fines outstanding"
                  value={`KES ${finesOutstanding.toLocaleString()}`}
                  href={`${libBase}/fines`}
                  icon={CheckCircle}
                  color={finesOutstanding > 0 ? "warn" : "success"}
                  sub={studentsWithFines > 0 ? `${studentsWithFines} students` : "All cleared"} />
      </div>

      <div className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <div className="grid grid-cols-2 xs:flex xs:flex-wrap gap-2">
          {[
            { label: "Issue book",     href: `${libBase}/issue`     },
            { label: "Return book",    href: `${libBase}/return`    },
            { label: "Student cards",  href: `${libBase}/cards`     },
            { label: "Manage fines",   href: `${libBase}/fines`     },
          ].map((a) => (
            <Link key={a.href} href={a.href}
              className="text-xs font-medium text-teal border border-teal/30 rounded-lg px-3 py-2
                         hover:bg-teal hover:text-white transition-colors min-h-[40px] flex items-center
                         justify-center xs:justify-start">
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
