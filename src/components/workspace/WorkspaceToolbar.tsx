"use client";

/**
 * WorkspaceToolbar — premium control bar for module-specific actions.
 *
 * Sits below ContextNavigation and above the main workspace content.
 * Contains only controls relevant to the current module: search, filters,
 * sorting, date ranges, export, printing, bulk actions, or view customization.
 *
 * Usage:
 *   <WorkspaceToolbar>
 *     <WorkspaceToolbar.Search ... />
 *     <WorkspaceToolbar.Filter ... />
 *     <WorkspaceToolbar.Actions>...</WorkspaceToolbar.Actions>
 *   </WorkspaceToolbar>
 */

import {
  Search,
  SlidersHorizontal,
  X,
  Download,
  Printer,
  RefreshCw,
  ChevronDown,
  LayoutGrid,
  List,
  Table2,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { ReactNode, useRef, useState, useEffect } from "react";
import { inputClass } from "@/components/ui";

interface WorkspaceToolbarProps {
  children: ReactNode;
  className?: string;
}

export default function WorkspaceToolbar({ children, className = "" }: WorkspaceToolbarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-4 sm:mb-6 ${className}`}>
      {children}
    </div>
  );
}

// ── Search input ──────────────────────────────────────────────────────────

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function WorkspaceSearch({ value, onChange, placeholder = "Search…", className = "" }: SearchProps) {
  return (
    <div className={`relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/60 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card pl-9 pr-9
                   py-2.5 sm:py-2 text-sm text-foreground placeholder:text-slate-light
                   focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15
                   transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full
                     flex items-center justify-center text-slate hover:text-foreground
                     hover:bg-slate-100 transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

WorkspaceToolbar.Search = WorkspaceSearch;

// ── Filter dropdown ───────────────────────────────────────────────────────

interface FilterProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  className?: string;
}

function WorkspaceFilter({ label, value, options, onChange, icon, className = "" }: FilterProps) {
  const isActive = value !== "" && value !== options[0]?.value;
  return (
    <div className={`relative flex items-center ${className}`}>
      {icon && (
        <span className="absolute left-2.5 text-slate/60 pointer-events-none">{icon}</span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-lg border pr-8 py-2.5 sm:py-2 text-sm
                    transition-colors focus:outline-none focus:ring-2 focus:ring-teal/15
                    ${icon ? "pl-8" : "pl-3"}
                    ${isActive
                      ? "border-teal/50 bg-teal-50 text-teal font-medium focus:border-teal"
                      : "border-border bg-card text-foreground focus:border-teal"
                    }`}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${isActive ? "text-teal" : "text-slate/60"}`} />
    </div>
  );
}

WorkspaceToolbar.Filter = WorkspaceFilter;

// ── Filter button (toggle panel) ──────────────────────────────────────────

interface FilterButtonProps {
  onClick: () => void;
  active?: boolean;
  count?: number;
  label?: string;
}

function WorkspaceFilterButton({ onClick, active = false, count, label = "Filters" }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 sm:py-2
                  text-sm font-medium transition-colors focus:outline-none focus:ring-2
                  focus:ring-teal/15 min-h-[44px] sm:min-h-0
                  ${active
                    ? "border-teal/50 bg-teal-50 text-teal"
                    : "border-border bg-card text-foreground hover:bg-slate-50"
                  }`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
                         flex items-center justify-center leading-none bg-teal text-white">
          {count}
        </span>
      )}
    </button>
  );
}

WorkspaceToolbar.FilterButton = WorkspaceFilterButton;

// ── Sort button ───────────────────────────────────────────────────────────

interface SortButtonProps {
  label?: string;
  active?: boolean;
  onClick: () => void;
}

function WorkspaceSortButton({ label = "Sort", active = false, onClick }: SortButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal/15 ${
        active
          ? "border-teal/50 bg-teal-50 text-teal"
          : "border-border bg-card text-foreground hover:bg-slate-50"
      }`}
    >
      <ArrowUpDown className="h-4 w-4" />
      {label}
    </button>
  );
}

WorkspaceToolbar.SortButton = WorkspaceSortButton;

// ── Export button ─────────────────────────────────────────────────────────

interface ExportButtonProps {
  onClick: () => void;
  label?: string;
  loading?: boolean;
}

function WorkspaceExportButton({ onClick, label = "Export", loading = false }: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card
                 px-3 py-2.5 sm:py-2 text-sm font-medium text-foreground hover:bg-slate-50
                 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/15
                 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
    >
      <Download className="h-4 w-4 text-slate/70" />
      {loading ? "Exporting…" : label}
    </button>
  );
}

WorkspaceToolbar.ExportButton = WorkspaceExportButton;

// ── Print button ──────────────────────────────────────────────────────────

interface PrintButtonProps {
  onClick: () => void;
  label?: string;
}

function WorkspacePrintButton({ onClick, label = "Print" }: PrintButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card
                 px-3 py-2.5 sm:py-2 text-sm font-medium text-foreground hover:bg-slate-50
                 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/15
                 min-h-[44px] sm:min-h-0"
    >
      <Printer className="h-4 w-4 text-slate/70" />
      {label}
    </button>
  );
}

WorkspaceToolbar.PrintButton = WorkspacePrintButton;

// ── Refresh button ────────────────────────────────────────────────────────

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
}

function WorkspaceRefreshButton({ onClick, loading = false }: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label="Refresh"
      title="Refresh"
      className="inline-flex items-center justify-center h-11 w-11 sm:h-9 sm:w-9
                 rounded-lg border border-border bg-card text-slate hover:text-foreground
                 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2
                 focus:ring-teal/15 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

WorkspaceToolbar.RefreshButton = WorkspaceRefreshButton;

// ── View switcher ─────────────────────────────────────────────────────────

type ViewMode = "table" | "grid" | "list";

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  modes?: ViewMode[];
}

const VIEW_ICONS: Record<ViewMode, ReactNode> = {
  table: <Table2 className="h-4 w-4" />,
  grid: <LayoutGrid className="h-4 w-4" />,
  list: <List className="h-4 w-4" />,
};

const VIEW_LABELS: Record<ViewMode, string> = {
  table: "Table view",
  grid: "Grid view",
  list: "List view",
};

function WorkspaceViewSwitcher({
  value,
  onChange,
  modes = ["table", "list"],
}: ViewSwitcherProps) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card overflow-hidden">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-label={VIEW_LABELS[mode]}
          title={VIEW_LABELS[mode]}
          className={`inline-flex items-center justify-center h-9 w-9 transition-colors focus:outline-none focus:ring-inset focus:ring-2 focus:ring-teal/15 ${
            value === mode
              ? "bg-teal text-white"
              : "text-slate hover:bg-slate-50 hover:text-foreground"
          }`}
        >
          {VIEW_ICONS[mode]}
        </button>
      ))}
    </div>
  );
}

WorkspaceToolbar.ViewSwitcher = WorkspaceViewSwitcher;

// ── Column visibility dropdown ────────────────────────────────────────────

interface ColumnVisibilityProps {
  columns: { key: string; label: string }[];
  visible: Set<string>;
  onChange: (key: string, visible: boolean) => void;
}

function WorkspaceColumnVisibility({ columns, visible, onChange }: ColumnVisibilityProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hiddenCount = columns.filter((c) => !visible.has(c.key)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal/15 ${
          hiddenCount > 0
            ? "border-teal/50 bg-teal-50 text-teal"
            : "border-border bg-card text-foreground hover:bg-slate-50"
        }`}
      >
        <Table2 className="h-4 w-4" />
        Columns
        {hiddenCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center leading-none bg-teal text-white">
            {hiddenCount}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-slate/60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-lg py-1.5 animate-scale-in origin-top-right">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-slate uppercase tracking-wide">
            Toggle columns
          </p>
          {columns.map((col) => {
            const isVisible = visible.has(col.key);
            return (
              <button
                key={col.key}
                onClick={() => onChange(col.key, !isVisible)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-slate-50 transition-colors"
              >
                <span
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${
                    isVisible ? "bg-teal border-teal text-white" : "border-border"
                  }`}
                >
                  {isVisible && <Check className="h-3 w-3" />}
                </span>
                {col.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

WorkspaceToolbar.ColumnVisibility = WorkspaceColumnVisibility;

// ── Bulk action bar ───────────────────────────────────────────────────────

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

function WorkspaceBulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-teal/30
                    bg-teal-50 px-4 py-2.5 mb-4 animate-fade-in dark:border-teal/20">
      <span className="text-sm font-medium text-teal">
        {count} selected
      </span>
      <div className="flex flex-wrap items-center gap-2 ml-2">{children}</div>
      <button
        onClick={onClear}
        className="sm:ml-auto inline-flex items-center gap-1.5 text-sm text-slate
                   hover:text-foreground transition-colors min-h-[44px] sm:min-h-0 px-1"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}

WorkspaceToolbar.BulkActionBar = WorkspaceBulkActionBar;

// ── Result count ──────────────────────────────────────────────────────────

interface ResultCountProps {
  count: number;
  total?: number;
  label?: string;
}

function WorkspaceResultCount({ count, total, label = "result" }: ResultCountProps) {
  const plural = count !== 1 ? `${label}s` : label;
  return (
    <span className="text-sm text-slate tabular-nums">
      {total !== undefined && total !== count ? (
        <>
          <span className="font-medium text-foreground">{count}</span>
          {" / "}
          {total} {plural}
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">{count}</span> {plural}
        </>
      )}
    </span>
  );
}

WorkspaceToolbar.ResultCount = WorkspaceResultCount;

// ── Actions container ─────────────────────────────────────────────────────

interface ActionsProps {
  children: ReactNode;
  className?: string;
}

function WorkspaceActions({ children, className = "" }: ActionsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 sm:ml-auto ${className}`}>
      {children}
    </div>
  );
}

WorkspaceToolbar.Actions = WorkspaceActions;

// ── Date range picker ─────────────────────────────────────────────────────

interface DateRangeProps {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  label?: string;
  className?: string;
}

function WorkspaceDateRange({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  label = "Date range",
  className = "",
}: DateRangeProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-slate shrink-0">{label}:</span>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className={`${inputClass} w-auto min-h-[44px] sm:min-h-0`}
        aria-label="Start date"
      />
      <span className="text-slate text-sm">→</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className={`${inputClass} w-auto min-h-[44px] sm:min-h-0`}
        aria-label="End date"
      />
    </div>
  );
}

WorkspaceToolbar.DateRange = WorkspaceDateRange;

// ── Filter panel (collapsible advanced filters) ───────────────────────────

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

function WorkspaceFilterPanel({ open, onClose, children }: FilterPanelProps) {
  if (!open) return null;

  return (
    <div className="w-full mb-4 p-4 bg-card border border-border rounded-xl shadow-sm animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Advanced filters</h3>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center text-slate hover:text-foreground hover:bg-slate-100 transition-colors"
          aria-label="Close filters"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

WorkspaceToolbar.FilterPanel = WorkspaceFilterPanel;

// ── Divider ───────────────────────────────────────────────────────────────

function WorkspaceDivider() {
  return <div className="w-px h-6 bg-line mx-1 shrink-0" aria-hidden />;
}

WorkspaceToolbar.Divider = WorkspaceDivider;
