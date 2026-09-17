"use client";

/**
 * src/components/ProductivityProvider.tsx
 *
 * Client-side provider that wires up Stage 8 productivity features:
 *
 *   1. Hydrates the productivityStore from localStorage on first render.
 *      (The store already loads from localStorage at creation time, so this
 *       is a no-op in practice — but the component provides a clean mount
 *       point for any future async init.)
 *
 *   2. Tracks route changes via the pathname and records them into the
 *      "recent pages" history. Uses a static page-label registry that maps
 *      pathname patterns → human-readable labels and icons.
 *
 *   Note: this used to seed three fake notifications on first load so the bell
 *   wouldn't look empty — including a fabricated "attendance has not been taken
 *   for 3 classes today" that a principal could act on. Real notifications now
 *   arrive from the server via ServerNotificationSync, so an empty bell simply
 *   means there is nothing to report, which is the honest thing to show.
 *
 * Mount this inside the root layout (or per-role layout) wrapping {children}.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useProductivityStore } from "@/lib/stores/productivityStore";

// ---------------------------------------------------------------------------
// Page label registry
// Maps the last one or two path segments to a label + icon.
// More-specific entries (two segments) must come before general ones.
// ---------------------------------------------------------------------------

interface PageMeta {
  label: string;
  icon: string;
}

const SEG_MAP: Record<string, PageMeta> = {
  // Two-segment keys first
  "people/students":       { label: "Students",        icon: "GraduationCap"  },
  "people/staff":          { label: "Staff",            icon: "UserCheck"      },
  "academics/classes":     { label: "Classes",          icon: "School"         },
  "academics/subjects":    { label: "Subjects",         icon: "BookMarked"     },
  "academics/timetable":   { label: "Timetable",        icon: "CalendarDays"   },
  "academics/attendance":  { label: "Attendance",       icon: "ClipboardCheck" },
  "academics/calendar":    { label: "Calendar",         icon: "Calendar"       },
  "academics/assessments": { label: "Assessments",      icon: "ClipboardList"  },
  // Single-segment keys
  students:                { label: "Students",         icon: "GraduationCap"  },
  staff:                   { label: "Staff",            icon: "UserCheck"      },
  people:                  { label: "People",           icon: "UsersRound"     },
  classes:                 { label: "Classes",          icon: "School"         },
  subjects:                { label: "Subjects",         icon: "BookMarked"     },
  timetable:               { label: "Timetable",        icon: "CalendarDays"   },
  attendance:              { label: "Attendance",       icon: "ClipboardCheck" },
  calendar:                { label: "Calendar",         icon: "Calendar"       },
  assessments:             { label: "Assessments",      icon: "ClipboardList"  },
  communication:           { label: "Communication",    icon: "MessageSquare"  },
  reports:                 { label: "Reports",          icon: "FileText"       },
  records:                 { label: "Conduct & Recognition", icon: "Archive"   },
  results:                 { label: "Results",          icon: "BarChart2"      },
  "exam-periods":          { label: "Exam Periods",     icon: "BookOpenCheck"  },
  departments:             { label: "Departments",      icon: "Layers"         },
  library:                 { label: "Library",          icon: "Library"        },
  settings:                { label: "Settings",         icon: "Settings"       },
  administration:          { label: "Administration",   icon: "Settings2"      },
  academics:               { label: "Academics",        icon: "BookOpen"       },
  directory:               { label: "Staff Directory",  icon: "ContactRound"   },
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface Props {
  children: React.ReactNode;
  /** Routing role prefix used to build hrefs in recent-page tracking */
  role?: string;
}

export default function ProductivityProvider({ children, role }: Props) {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);


  /* ── Track route changes ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!pathname || pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Don't track auth / root pages
    if (pathname === "/login" || pathname === "/" || pathname === `/${role}`) return;

    // Derive label + icon from path segments
    const segs = pathname.split("/").filter(Boolean);
    // segs[0] = role, segs[1] = hub/section, segs[2+] = sub-page

    if (segs.length < 2) return;

    // Skip detail pages (e.g. /principal/students/[id]) — only track list pages
    // A detail page has 3+ segments where the last looks like an ID (uuid/numeric)
    const lastSeg = segs[segs.length - 1];
    const looksLikeId = /^[0-9a-f-]{8,}$/i.test(lastSeg) || /^\d+$/.test(lastSeg);
    if (segs.length > 2 && looksLikeId) return;

    // Build lookup keys (two-segment then one-segment)
    const twoSegKey = segs.slice(1, 3).join("/");
    const oneSegKey = segs[1];
    const meta = SEG_MAP[twoSegKey] ?? SEG_MAP[oneSegKey];

    if (!meta) return;

    // Access trackVisit via getState() to avoid subscribing to the function
    // reference — Zustand creates a new function object on every state update,
    // which would cause this effect to re-run endlessly if used as a dependency.
    useProductivityStore.getState().trackVisit({
      href:  pathname,
      label: meta.label,
      icon:  meta.icon,
      hub:   oneSegKey,
    });
  }, [pathname, role]);

  return <>{children}</>;
}
