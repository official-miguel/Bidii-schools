"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const TYPES = [
  { value: "",             label: "All" },
  { value: "ASSIGNMENT",   label: "Assignments" },
  { value: "HOMEWORK",     label: "Homework" },
  { value: "REVISION",     label: "Revision" },
  { value: "PROJECT",      label: "Projects" },
  { value: "ANNOUNCEMENT", label: "Announcements" },
];

interface DiaryFiltersProps {
  activeType?: string;
}

export default function DiaryFilters({ activeType }: DiaryFiltersProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const handleFilter = useCallback(
    (type: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (type) {
        params.set("type", type);
      } else {
        params.delete("type");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const active = activeType ?? "";

  return (
    <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by type">
      {TYPES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleFilter(value)}
          aria-pressed={active === value}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors min-h-[32px]
            ${active === value
              ? "bg-teal text-white"
              : "bg-line text-slate hover:bg-teal/10 hover:text-teal dark:bg-dark-border dark:text-dark-muted dark:hover:bg-teal/20 dark:hover:text-teal"
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
