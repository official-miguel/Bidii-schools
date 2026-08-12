"use client";

/**
 * SuperAdminSidebar
 *
 * Fixed 64px icon-rail for the super-admin control panel.
 * Uses the ink (deep charcoal) background to visually separate
 * the control plane from school-facing dashboards which use white.
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Puzzle,
  AlertTriangle,
  Activity,
  HardDrive,
  Upload,
  LogOut,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/super-admin",          label: "Overview",  Icon: LayoutDashboard },
  { href: "/super-admin/schools",  label: "Schools",   Icon: Building2       },
  { href: "/super-admin/modules",  label: "Modules",   Icon: Puzzle          },
  { href: "/super-admin/errors",   label: "Errors",    Icon: AlertTriangle   },
  { href: "/super-admin/health",   label: "Health",    Icon: Activity        },
  { href: "/super-admin/storage",  label: "Storage",   Icon: HardDrive       },
  { href: "/super-admin/imports",  label: "Imports",   Icon: Upload          },
] as const;

export default function SuperAdminSidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/super-admin") return pathname === "/super-admin";
    return pathname.startsWith(href);
  }

  return (
    <aside
      aria-label="Super admin navigation"
      className="fixed top-0 left-0 h-screen w-16 hidden md:flex flex-col z-40
                 bg-ink dark:bg-dark-sidebar border-r border-ink-light/20"
    >
      {/* Logo */}
      <div className="flex items-center justify-center h-16 shrink-0 border-b border-white/10">
        <Link
          href="/super-admin"
          aria-label="Super Admin Home"
          title="Bidii Super Admin"
          className="flex items-center justify-center h-10 w-10 rounded-lg
                     overflow-hidden hover:opacity-80 transition-opacity"
        >
          <Image src="/logo.png" alt="Bidii" width={40} height={40} className="object-contain" />
        </Link>
      </div>

      {/* Super-admin identity badge */}
      <div className="flex items-center justify-center py-2.5 border-b border-white/10">
        <div
          title="Super Admin Control Plane"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal/20"
        >
          <ShieldCheck className="h-4 w-4 text-teal-light" strokeWidth={2} aria-hidden />
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <div key={href} className="relative w-full flex justify-center group">
              {/* Active indicator pill */}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal rounded-r-full"
                />
              )}
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-100
                  ${active
                    ? "bg-teal/20 text-teal-light"
                    : "text-white/50 hover:bg-white/10 hover:text-white"
                  }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
              </Link>
              {/* Tooltip */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2
                           whitespace-nowrap rounded-md shadow-md bg-ink text-white text-xs font-medium
                           px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 z-50"
              >
                {label}
              </span>
            </div>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="flex flex-col items-center pb-4 pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className="flex items-center justify-center w-11 h-11 rounded-lg
                     text-white/50 hover:bg-danger/20 hover:text-danger
                     transition-colors duration-100"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
