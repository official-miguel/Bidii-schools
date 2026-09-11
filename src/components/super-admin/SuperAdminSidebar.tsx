"use client";

/**
 * SuperAdminSidebar
 *
 * Fixed wider sidebar for the super-admin control panel.
 * Uses the teal background with the Bidii branding to visually separate
 * the control plane from school-facing dashboards.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard,
  Building2,
  Puzzle,
  AlertTriangle,
  Activity,
  HardDrive,
  Upload,
  MessageSquare,
  HelpCircle,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/super-admin",                label: "Dashboard",    Icon: LayoutDashboard },
  { href: "/super-admin/schools",        label: "Schools",      Icon: Building2       },
  { href: "/super-admin/modules",        label: "Modules",      Icon: Puzzle          },
  { href: "/super-admin/errors",         label: "Errors",       Icon: AlertTriangle   },
  { href: "/super-admin/health",         label: "Health",       Icon: Activity        },
  { href: "/super-admin/storage",        label: "Storage",      Icon: HardDrive       },
  { href: "/super-admin/imports",        label: "Imports",      Icon: Upload          },
  { href: "/super-admin/settings/sms",   label: "Platform SMS", Icon: MessageSquare   },
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
      className="fixed top-0 left-0 h-screen w-44 hidden md:flex flex-col z-40
                 bg-teal-800 shadow-lg"
    >
      {/* Logo & Branding */}
      <div className="flex flex-col items-center justify-center py-6 px-4 border-b border-teal-700/50">
        <Link
          href="/super-admin"
          aria-label="Super Admin Home"
          className="flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Logo height={32} width={32} alt="Bidii" className="object-contain" />
          <div className="flex flex-col -space-y-0.5">
            <span className="text-white font-bold text-base leading-tight">Bidii</span>
            <span className="text-white/80 text-[10px] font-medium uppercase tracking-wider leading-tight">
              SCHOOLS
            </span>
          </div>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-1 py-4 px-3 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
                ${active
                  ? "bg-white text-teal-800 shadow-sm font-medium"
                  : "text-white/90 hover:bg-teal-700/50 hover:text-white"
                }`}
            >
              <Icon 
                className="h-5 w-5 shrink-0" 
                strokeWidth={active ? 2 : 1.8} 
                aria-hidden 
              />
              <span className="text-sm truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-3 pb-4 pt-3 border-t border-teal-700/50">
        <Link
          href="/super-admin/support"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                     text-white/90 hover:bg-teal-700/50 hover:text-white
                     transition-all duration-150"
        >
          <HelpCircle className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
          <span className="text-sm">Support</span>
        </Link>
        
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Logout"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                     text-white/90 hover:bg-red-600/20 hover:text-red-200
                     transition-all duration-150"
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
}
