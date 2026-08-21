"use client";

/**
 * /staff/library/lending
 *
 * Lending hub — the section landing page for all circulation-related tools.
 * Clicking "Lending" in the sidebar lands here; the user then picks a tile
 * to go deeper into Circulate, Reservations, or Scan Mode.
 *
 * Design:
 *   - Matches the existing library page visual language exactly
 *     (same PageHeader, same card classes, same teal/white palette)
 *   - Three primary action tiles in a responsive grid
 *   - Each tile: icon, title, description, subtle hover lift, full-card link
 *   - A compact "quick facts" strip below for at-a-glance lending stats
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  CalendarClock,
  QrCode,
  ArrowRight,
  BookOpen,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface LendingStats {
  copiesCurrentlyOut: number;
  overdueCount:       number;
  reservationsPending: number;
}

// ── Tile definition ────────────────────────────────────────────────────────

interface Tile {
  href:        string;
  icon:        React.ReactNode;
  iconBg:      string;
  iconColor:   string;
  label:       string;
  description: string;
  badge?:      { text: string; urgent: boolean };
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LendingHubPage() {
  const [stats, setStats]     = useState<LendingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/library/summary")
      .then((r) => r.json())
      .then((d) =>
        setStats({
          copiesCurrentlyOut:  d.copiesCurrentlyOut  ?? 0,
          overdueCount:        d.overdueCount         ?? 0,
          reservationsPending: d.reservationsPending  ?? 0,
        })
      )
      .catch(() => {/* non-fatal — stats are decorative */})
      .finally(() => setLoading(false));
  }, []);

  const tiles: Tile[] = [
    {
      href:        "/staff/library/circulate",
      icon:        <ArrowLeftRight className="h-7 w-7" />,
      iconBg:      "bg-teal/10",
      iconColor:   "text-teal",
      label:       "Circulation Desk",
      description:
        "Issue, return, and renew books. Full policy enforcement — fine checks, " +
        "borrowing limits, and QR/accession-number lookup in one workflow.",
      badge:
        !loading && stats && stats.copiesCurrentlyOut > 0
          ? { text: `${stats.copiesCurrentlyOut} out`, urgent: false }
          : undefined,
    },
    {
      href:        "/staff/library/reservations",
      icon:        <CalendarClock className="h-7 w-7" />,
      iconBg:      "bg-indigo-50 dark:bg-indigo-950/40",
      iconColor:   "text-indigo-600 dark:text-indigo-400",
      label:       "Reservations",
      description:
        "Manage student and classroom book reservations. View the queue, " +
        "allocate available copies, and cancel or fulfil holds.",
      badge:
        !loading && stats && stats.reservationsPending > 0
          ? { text: `${stats.reservationsPending} pending`, urgent: false }
          : undefined,
    },
    {
      href:        "/staff/library/scan",
      icon:        <QrCode className="h-7 w-7" />,
      iconBg:      "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor:   "text-emerald-600 dark:text-emerald-400",
      label:       "Scan Mode",
      description:
        "Dedicated QR-scanning interface for high-volume returns. Plug in a " +
        "hardware scanner or use the device camera to process books quickly.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lending"
        description="Circulation, reservations, and scanning — all your borrowing tools in one place."
      />

      {/* ── Overdue alert strip ─────────────────────────────────── */}
      {!loading && stats && stats.overdueCount > 0 && (
        <Link
          href="/staff/library/circulate?filter=overdue"
          className="flex items-center gap-3 mb-6 px-4 py-3 rounded-xl border border-danger/25 bg-danger-bg/60 text-danger text-sm font-medium hover:bg-danger-bg transition-colors"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {stats.overdueCount} overdue borrow
            {stats.overdueCount !== 1 ? "s" : ""} — click to view
          </span>
          <ArrowRight className="h-4 w-4 ml-auto shrink-0" />
        </Link>
      )}

      {/* ── Primary tile grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {tiles.map((tile) => (
          <SectionTile key={tile.href} tile={tile} />
        ))}
      </div>

      {/* ── Quick-facts strip ────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-3 gap-4">
          <FactPill
            icon={<BookOpen className="h-4 w-4" />}
            label="Books out"
            value={stats.copiesCurrentlyOut}
          />
          <FactPill
            icon={<Clock className="h-4 w-4" />}
            label="Overdue"
            value={stats.overdueCount}
            urgent={stats.overdueCount > 0}
          />
          <FactPill
            icon={<CalendarClock className="h-4 w-4" />}
            label="Pending reservations"
            value={stats.reservationsPending}
          />
        </div>
      )}
    </div>
  );
}

// ── SectionTile ───────────────────────────────────────────────────────────

function SectionTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className="
        group relative flex flex-col gap-4 rounded-2xl border border-line bg-white p-6
        hover:border-teal/35 hover:shadow-md hover:-translate-y-0.5
        transition-all duration-150 cursor-pointer
        dark:bg-dark-surface dark:border-dark-border
        dark:hover:border-teal/40
      "
    >
      {/* Badge */}
      {tile.badge && (
        <span
          className={`
            absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wide
            px-2 py-0.5 rounded-full
            ${
              tile.badge.urgent
                ? "bg-danger/10 text-danger"
                : "bg-teal/10 text-teal"
            }
          `}
        >
          {tile.badge.text}
        </span>
      )}

      {/* Icon */}
      <div
        className={`
          flex items-center justify-center h-14 w-14 rounded-2xl shrink-0
          ${tile.iconBg} ${tile.iconColor}
        `}
      >
        {tile.icon}
      </div>

      {/* Text */}
      <div className="flex-1">
        <h3 className="text-base font-semibold text-ink dark:text-dark-text mb-1.5">
          {tile.label}
        </h3>
        <p className="text-sm text-slate dark:text-dark-muted leading-relaxed">
          {tile.description}
        </p>
      </div>

      {/* Arrow — slides in on hover */}
      <div className="flex items-center justify-end mt-auto pt-2 border-t border-line/60 dark:border-dark-border/60">
        <span className="text-xs font-medium text-slate dark:text-dark-muted group-hover:text-teal transition-colors mr-1.5">
          Open
        </span>
        <ArrowRight
          className="h-4 w-4 text-slate/40 group-hover:text-teal group-hover:translate-x-0.5 transition-all duration-150 dark:text-dark-muted/40"
        />
      </div>
    </Link>
  );
}

// ── FactPill ──────────────────────────────────────────────────────────────

function FactPill({
  icon,
  label,
  value,
  urgent = false,
}: {
  icon:    React.ReactNode;
  label:   string;
  value:   number;
  urgent?: boolean;
}) {
  return (
    <div
      className={`
        flex items-center gap-3 rounded-xl border px-4 py-3
        ${
          urgent
            ? "border-danger/25 bg-danger-bg/40 dark:bg-danger/10"
            : "border-line bg-white dark:bg-dark-surface dark:border-dark-border"
        }
      `}
    >
      <span
        className={`shrink-0 ${urgent ? "text-danger" : "text-teal"}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className={`text-lg font-bold leading-none ${
            urgent ? "text-danger" : "text-ink dark:text-dark-text"
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-slate dark:text-dark-muted mt-0.5 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}
