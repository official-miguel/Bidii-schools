"use client";

/**
 * NotificationModuleFilter
 *
 * Horizontal tab bar for filtering parent notifications by module.
 * Navigates via router.push to update the ?module= query param.
 */

import { useRouter } from "next/navigation";

interface Props {
  activeModule?: string;
}

interface Tab {
  label: string;
  value: string | null;
  colorClass: string;
}

const TABS: Tab[] = [
  { label: "All",          value: null,           colorClass: "" },
  { label: "Diary",        value: "DIARY",        colorClass: "bg-blue-100 text-blue-700" },
  { label: "Academic",     value: "ACADEMIC",     colorClass: "bg-purple-100 text-purple-700" },
  { label: "Attendance",   value: "ATTENDANCE",   colorClass: "bg-orange-100 text-orange-700" },
  { label: "Fees",         value: "FEES",         colorClass: "bg-green-100 text-green-700" },
  { label: "Behaviour",    value: "BEHAVIOUR",    colorClass: "bg-red-100 text-red-700" },
  { label: "Achievements", value: "ACHIEVEMENTS", colorClass: "bg-yellow-100 text-yellow-700" },
  { label: "Calendar",     value: "CALENDAR",     colorClass: "bg-teal-50 text-teal-700" },
];

export default function NotificationModuleFilter({ activeModule }: Props) {
  const router = useRouter();

  function handleTab(value: string | null) {
    if (value) {
      router.push(`?module=${value}`);
    } else {
      router.push("?");
    }
  }

  return (
    <nav
      aria-label="Filter notifications by module"
      className="overflow-x-auto flex gap-1 whitespace-nowrap py-2 -mx-1 px-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === null
          ? !activeModule
          : activeModule === tab.value;

        return (
          <button
            key={tab.value ?? "all"}
            type="button"
            onClick={() => handleTab(tab.value)}
            aria-pressed={isActive}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
              "transition-colors duration-100 border-b-2",
              isActive
                ? "border-teal text-teal bg-teal-50"
                : "border-transparent text-slate hover:text-ink hover:bg-paper",
              tab.value && !isActive ? tab.colorClass : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
