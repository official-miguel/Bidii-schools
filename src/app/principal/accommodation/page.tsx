"use client";

import Link from "next/link";
import { Building2, ShieldAlert } from "lucide-react";

// ── Hub tiles ─────────────────────────────────────────────────────────────────

const STUDENT_LIFE_TILES = [
  {
    href: "/principal/accommodation/overview",
    icon: Building2,
    label: "Accommodation",
    description: "Dormitories, boarding allocations, occupancy, and inspections.",
    cta: "Manage Accommodation →",
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

export default function StudentLifeHubPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">Student Life</h1>
      <p className="text-slate text-sm mb-8">
        Boarding accommodation, conduct records, and student recognition.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {STUDENT_LIFE_TILES.map(({ href, icon: Icon, label, description, cta }) => (
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
