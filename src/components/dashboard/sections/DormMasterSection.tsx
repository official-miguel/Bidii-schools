import Link from "next/link";
import { Home, Users, AlertTriangle, CheckCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import type { DormMasterRole } from "@/lib/derivedRoles";

interface DormRow {
  id: string; name: string; totalCapacity: number;
  genderPolicy: string; status: string;
  _count: { beds: number };
}

interface Props {
  rolePrefix:     string;
  derived:        DormMasterRole | null;
  dorms:          DormRow[];
  occupiedBeds:   number;
  totalCapacity:  number;
  occupancyPct:   number;
  openDiscipline: number;
  isSchoolWide:   boolean;
}

export default function DormMasterSection({
  rolePrefix, derived, dorms, occupiedBeds, totalCapacity,
  occupancyPct, openDiscipline, isSchoolWide,
}: Props) {
  const accomBase = `/${rolePrefix}/accommodation`;

  return (
    <section aria-labelledby="dorm-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="dorm-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          {isSchoolWide ? "Boarding — School-wide" : `Boarding${derived && derived.dorms.length === 1 ? ` — ${derived.dorms[0].name}` : ""}`}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Dormitories"    value={dorms.length}  href={accomBase} icon={Home}          color="teal" />
        <StatCard label="Total capacity" value={totalCapacity} href={accomBase} icon={Users}         color="teal" />
        <StatCard label="Occupied beds"  value={occupiedBeds}  href={accomBase} icon={CheckCircle}
                  color={occupancyPct > 95 ? "warn" : "success"}
                  badge={`${occupancyPct}%`}
                  badgeColor={occupancyPct > 95 ? "warn" : "success"} />
        <StatCard label="Open discipline" value={openDiscipline} href={`/${rolePrefix}/records`}
                  icon={AlertTriangle} color={openDiscipline > 0 ? "warn" : "success"} />
      </div>

      {dorms.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Dormitory status</p>
            <Link href={accomBase} className="text-xs text-teal hover:underline">Manage</Link>
          </div>
          <div className="space-y-3">
            {dorms.map((dorm) => {
              const pct = dorm.totalCapacity > 0
                ? Math.round((dorm._count.beds / dorm.totalCapacity) * 100)
                : 0;
              return (
                <div key={dorm.id}>
                  <div className="flex items-center justify-between gap-2 text-sm mb-1">
                    <span className="text-ink dark:text-dark-text font-medium truncate min-w-0">{dorm.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {dorm.genderPolicy !== "MIXED" && (
                        <span className="text-[10px] uppercase font-semibold text-slate bg-line
                                         px-1.5 py-0.5 rounded dark:bg-dark-border dark:text-dark-muted">
                          {dorm.genderPolicy}
                        </span>
                      )}
                      <span className="text-xs text-slate dark:text-dark-muted">
                        {dorm._count.beds}/{dorm.totalCapacity} · {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-line dark:bg-dark-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct > 95 ? "bg-danger" : pct > 80 ? "bg-warn" : "bg-teal"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
