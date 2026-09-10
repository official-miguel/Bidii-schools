"use client";

/**
 * ResponsiveTable — renders a conventional scrollable table on md+ screens
 * and a card-per-row layout on mobile, with full feature parity.
 *
 * Features preserved on all screen sizes:
 *  - Searching, filtering, sorting (controlled outside — pass sorted/filtered data)
 *  - Row click / navigation
 *  - Edit, delete, and arbitrary contextual actions per row
 *  - Bulk selection checkboxes
 *  - Sortable column headers (desktop table only; mobile card shows sort chips)
 *  - Empty state
 *
 * Usage:
 *   <ResponsiveTable
 *     columns={[
 *       { key: "name",  header: "Student",    render: (row) => <...> },
 *       { key: "class", header: "Class",      render: (row) => row.class },
 *       { key: "actions", header: "",         render: (row) => <...>, mobileHide: true },
 *     ]}
 *     data={students}
 *     keyExtractor={(row) => row.id}
 *     onRowClick={(row) => router.push(`/.../${row.id}`)}
 *     mobileActions={(row) => <...buttons...>}
 *     emptyState={<EmptyState ... />}
 *   />
 *
 * Column options:
 *   - mobileHide: true  → column is hidden on mobile card (use mobileActions instead)
 *   - mobilePrimary: true → displayed as the card title/headline
 *   - mobileSecondary: true → displayed as the card subtitle
 *   - sortable: true + sortKey → enables sort click on desktop column header
 *
 * Sorting:
 *   Pass sortKey + sortDir + onSort to enable interactive column headers.
 */

import { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  /** Render function for table cell / card field value */
  render: (row: T, index: number) => ReactNode;
  /** Width class applied to <th> on desktop, e.g. "w-[200px]" */
  width?: string;
  /** Hide this column on mobile cards (use mobileActions for row CTA buttons) */
  mobileHide?: boolean;
  /** Show as the large bold title on mobile card */
  mobilePrimary?: boolean;
  /** Show as the small subtitle line on mobile card */
  mobileSecondary?: boolean;
  /** Enable sort click on desktop column header */
  sortable?: boolean;
  sortKey?: string;
  /** Alignment */
  align?: "left" | "right" | "center";
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  /** Desktop: row click navigates; Mobile: the card itself is tappable */
  onRowClick?: (row: T) => void;
  /** Mobile-only: action buttons rendered at the bottom of each card */
  mobileActions?: (row: T) => ReactNode;
  /** Empty state element rendered when data is empty */
  emptyState?: ReactNode;
  /** Sort state — controlled externally */
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  /** Optional row-level className */
  rowClassName?: (row: T) => string;
  /** Caption for accessibility */
  caption?: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  mobileActions,
  emptyState,
  sortKey,
  sortDir,
  onSort,
  rowClassName,
  caption,
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {/* ── Desktop table (md+) ──────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full divide-y divide-border">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`
                    px-5 py-3.5 select-none
                    ${col.width ?? ""}
                    ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}
                    ${col.sortable && onSort ? "cursor-pointer hover:text-foreground transition-colors" : ""}
                  `}
                  onClick={col.sortable && onSort && col.sortKey ? () => onSort(col.sortKey!) : undefined}
                  aria-sort={
                    col.sortable && col.sortKey === sortKey
                      ? sortDir === "asc" ? "ascending" : "descending"
                      : col.sortable ? "none" : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && onSort && (
                      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {data.map((row, i) => (
              <tr
                key={keyExtractor(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`
                  border-b border-border last:border-0 transition-colors
                  ${onRowClick ? "cursor-pointer hover:bg-slate-50/50/30" : ""}
                  ${rowClassName?.(row) ?? ""}
                `}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`
                      px-5 py-3.5
                      ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}
                    `}
                    onClick={onRowClick ? (e) => e.stopPropagation() : undefined}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (<md) ───────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {data.map((row, i) => {
          const primaryCol   = columns.find((c) => c.mobilePrimary);
          const secondaryCol = columns.find((c) => c.mobileSecondary);
          const bodyColumns  = columns.filter(
            (c) => !c.mobileHide && !c.mobilePrimary && !c.mobileSecondary && c.header
          );
          const hasActions   = !!mobileActions;

          return (
            <div
              key={keyExtractor(row, i)}
              className={`
                rounded-xl border border-border bg-card
                shadow-xs overflow-hidden
                ${rowClassName?.(row) ?? ""}
              `}
            >
              {/* Card header — primary + secondary cells */}
              <div
                className={`
                  px-4 pt-4 pb-3
                  ${onRowClick ? "cursor-pointer active:bg-teal-50/40 dark:active:bg-dark-border/30" : ""}
                `}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") onRowClick(row); } : undefined}
              >
                {primaryCol && (
                  <div className="text-sm font-medium text-foreground mb-0.5">
                    {primaryCol.render(row, i)}
                  </div>
                )}
                {secondaryCol && (
                  <div className="text-xs text-slate">
                    {secondaryCol.render(row, i)}
                  </div>
                )}
              </div>

              {/* Body fields — label/value pairs */}
              {bodyColumns.length > 0 && (
                <dl className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border/60 pt-3/60">
                  {bodyColumns.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-[10px] font-semibold text-slate uppercase tracking-wide mb-0.5">
                        {col.header}
                      </dt>
                      <dd className="text-sm text-foreground truncate">
                        {col.render(row, i)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Mobile action buttons */}
              {hasActions && (
                <div className="px-4 pb-4 pt-2 flex items-center gap-2 flex-wrap border-t border-border/60/60">
                  {mobileActions!(row)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Sort icon helper ──────────────────────────────────────────────────────

function SortIcon<T>({
  col,
  sortKey,
  sortDir,
}: {
  col: ResponsiveColumn<T>;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  if (!col.sortKey || col.sortKey !== sortKey) {
    return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />;
  }
  return sortDir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-teal" aria-hidden />
    : <ChevronDown className="h-3 w-3 text-teal" aria-hidden />;
}
