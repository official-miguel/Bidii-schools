"use client";

/**
 * /staff/library/setup
 *
 * Library Setup hub — landing page for all configuration and management tools.
 * Three primary tiles: Inventory, Student Cards, Policies.
 *
 * Design:
 *   - Identical tile grid pattern as the Lending hub
 *   - Soft contextual stats from /api/library/summary for the chips
 *   - No data fetching failure can break the page — stats are decorative
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  CreditCard,
  BookMarked,
  ArrowRight,
  BookOpen,
  Users,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupStats {
  totalCatalogueEntries: number;
  totalCards:            number;
  activeCards:           number;
  suspendedCards:        number;
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

export default function SetupHubPage() {
  const [stats, setStats]     = useState<SetupStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/library/summary")
      .then((r) => r.json())
      .then((d) =>
        setStats({
          totalCatalogueEntries: d.totalCatalogueEntries ?? 0,
          totalCards:            d.totalCards            ?? 0,
          activeCards:           d.activeCards           ?? 0,
          suspendedCards:        d.suspendedCards        ?? 0,
        })
      )
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, []);

  const tiles: Tile[] = [
    {
      href:        "/staff/library/inventory",
      icon:        <Package className="h-7 w-7" />,
      iconBg:      "bg-teal/10",
      iconColor:   "text-teal",
      label:       "Inventory",
      description:
        "Manage the two-level book catalogue — title records and individual " +
        "physical copies. Add books, register copies, generate signed QR " +
        "stickers, and run bulk CSV imports.",
      badge:
        !loading && stats
          ? {
              text:   `${stats.totalCatalogueEntries} title${stats.totalCatalogueEntries !== 1 ? "s" : ""}`,
              urgent: false,
            }
          : undefined,
    },
    {
      href:        "/staff/library/cards",
      icon:        <CreditCard className="h-7 w-7" />,
      iconBg:      "bg-violet-50 dark:bg-violet-950/40",
      iconColor:   "text-violet-600 dark:text-violet-400",
      label:       "Student Cards",
      description:
        "View and manage student library cards. Issue new cards in bulk, " +
        "suspend or reinstate cards, clear fines, and track borrowing " +
        "history per student.",
      badge:
        !loading && stats && stats.suspendedCards > 0
          ? { text: `${stats.suspendedCards} suspended`, urgent: true }
          : !loading && stats
          ? { text: `${stats.activeCards} active`, urgent: false }
          : undefined,
    },
    {
      href:        "/staff/library/policies",
      icon:        <BookMarked className="h-7 w-7" />,
      iconBg:      "bg-amber-50 dark:bg-amber-950/40",
      iconColor:   "text-amber-600 dark:text-amber-400",
      label:       "Policies",
      description:
        "Configure circulation rules per patron type — borrow limits, loan " +
        "durations, fine rates, grace periods, renewal caps, and reservation " +
        "permissions. Supports DEFAULT, STUDENT, TEACHER, BOARDING, and more.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Library Setup"
        description="Configure your library — manage inventory, student cards, and circulation policies."
      />

      {/* ── Primary tile grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {tiles.map((tile) => (
          <SectionTile key={tile.href} tile={tile} />
        ))}
      </div>

      {/* ── Quick-facts strip ────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <FactPill
            icon={<BookOpen className="h-4 w-4" />}
            label="Catalogue titles"
            value={stats.totalCatalogueEntries}
          />
          <FactPill
            icon={<Users className="h-4 w-4" />}
            label="Cards issued"
            value={stats.totalCards}
          />
          <FactPill
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Active cards"
            value={stats.activeCards}
          />
          <FactPill
            icon={<Users className="h-4 w-4" />}
            label="Suspended"
            value={stats.suspendedCards}
            urgent={stats.suspendedCards > 0}
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

      {/* Arrow footer */}
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
      <span className={`shrink-0 ${urgent ? "text-danger" : "text-teal"}`}>
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
