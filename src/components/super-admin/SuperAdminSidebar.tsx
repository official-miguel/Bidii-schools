"use client";

/**
 * SuperAdminSidebar
 *
 * Fixed wider sidebar for the super-admin control panel.
 * Uses the teal background with the Bidii branding to visually separate
 * the control plane from school-facing dashboards.
 */

import { useEffect } from "react";
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
  Settings,
  LogOut,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/super-admin",                label: "Dashboard",    Icon: LayoutDashboard },
  { href: "/super-admin/schools",        label: "Schools",      Icon: Building2       },
  { href: "/super-admin/modules",        label: "Modules",      Icon: Puzzle          },
  { href: "/super-admin/errors",         label: "Errors",       Icon: AlertTriangle   },
  { href: "/super-admin/health",         label: "Health",       Icon: Activity        },
  { href: "/super-admin/storage",        label: "Storage",      Icon: HardDrive       },
  { href: "/super-admin/imports",        label: "Imports",      Icon: Upload          },
] as const;

/**
 * Settings is the platform owner's alone — the OTP SMS provider, super-admin
 * accounts, and the action history. Ordinary super admins never see the link
 * (and the route redirects them anyway).
 */
const OWNER_NAV_ITEM = {
  href: "/super-admin/settings", label: "Settings", Icon: Settings,
} as const;

interface Props {
  isOwner?:      boolean;
  /** Controls the mobile slide-in drawer; the desktop rail ignores these. */
  mobileOpen?:   boolean;
  onMobileClose?: () => void;
}

function NavLinks({
  navItems,
  isActive,
  onNavigate,
}: {
  navItems: readonly { href: string; label: string; Icon: typeof LayoutDashboard }[];
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navItems.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
    </>
  );
}

export default function SuperAdminSidebar({ isOwner = false, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname();
  const router   = useRouter();

  const navItems = isOwner ? [...NAV_ITEMS, OWNER_NAV_ITEM] : NAV_ITEMS;

  async function handleLogout() {
    onMobileClose?.();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/super-admin") return pathname === "/super-admin";
    return pathname.startsWith(href);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  const brand = (
    <Link
      href="/super-admin"
      aria-label="Super Admin Home"
      onClick={onMobileClose}
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
  );

  const logoutButton = (
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
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        aria-label="Super admin navigation"
        className="fixed top-0 left-0 h-screen w-44 hidden md:flex flex-col z-40
                   bg-teal-800 shadow-lg"
      >
        <div className="flex flex-col items-center justify-center py-6 px-4 border-b border-teal-700/50">
          {brand}
        </div>
        <nav className="flex-1 flex flex-col gap-1 py-4 px-3 overflow-y-auto">
          <NavLinks navItems={navItems} isActive={isActive} />
        </nav>
        <div className="flex flex-col gap-1 px-3 pb-4 pt-3 border-t border-teal-700/50">
          {logoutButton}
        </div>
      </aside>

      {/* Mobile slide-in drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Super admin navigation">
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-teal-800 shadow-xl">
            <div className="flex items-center justify-between py-4 px-4 border-b border-teal-700/50">
              {brand}
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close navigation menu"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-white/90
                           hover:bg-teal-700/50 transition-colors shrink-0"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1 py-4 px-3 overflow-y-auto">
              <NavLinks navItems={navItems} isActive={isActive} onNavigate={onMobileClose} />
            </nav>
            <div className="flex flex-col gap-1 px-3 pb-4 pt-3 border-t border-teal-700/50">
              {logoutButton}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
