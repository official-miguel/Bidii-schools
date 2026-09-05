"use client";

/**
 * ParentPortalShell
 *
 * Full-page shell for the parent portal.
 *
 * Desktop (md+):
 *   - Fixed 224px left sidebar with logo, text-label nav links, account
 *     section, child switcher, and switch-child button at the bottom.
 *   - Fixed 64px top bar: hamburger (hidden md+) | logo (hidden md+) |
 *     search | notifications bell | child chip | parent avatar dropdown.
 *   - Content area offset: pl-56 pt-16.
 *
 * Mobile (< md):
 *   - Fixed 64px top bar (same as desktop, hamburger visible).
 *   - Fixed bottom tab bar: Home | Academics | Diary | Messages | More.
 *   - Content area offset: pt-16 pb-16.
 *   - Slide-in drawer (triggered by hamburger) for full nav.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  GraduationCap,
  CalendarCheck,
  BookOpen,
  CreditCard,
  MessageSquare,
  Calendar,
  Bell,
  Settings,
  LogOut,
  UserCircle2,
  Menu,
  X,
  Search,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import { useParentStore } from "@/lib/stores/parentStore";
import ParentNotificationBadge from "@/components/parent/ParentNotificationBadge";

// ── Nav definitions ──────────────────────────────────────────────────────────

export const PARENT_NAV = [
  { label: "Home",             href: "/parent",               Icon: Home,          seg: null           },
  { label: "Academics",        href: "/parent/results",       Icon: GraduationCap, seg: "results"      },
  { label: "Attendance",       href: "/parent/attendance",    Icon: CalendarCheck, seg: "attendance"   },
  { label: "Diary",            href: "/parent/diary",         Icon: BookOpen,      seg: "diary"        },
  { label: "School Fees",      href: "/parent/fees",          Icon: CreditCard,    seg: "fees"         },
  { label: "Messages",         href: "/parent/messages",      Icon: MessageSquare, seg: "messages", badge: true },
  { label: "School Calendar",  href: "/parent/calendar",      Icon: Calendar,      seg: "calendar"     },
] as const;

// Bottom tab items (mobile only)
const BOTTOM_TABS = [
  { label: "Home",      href: "/parent",           Icon: Home,          seg: null      },
  { label: "Academics", href: "/parent/results",   Icon: GraduationCap, seg: "results" },
  { label: "Diary",     href: "/parent/diary",     Icon: BookOpen,      seg: "diary", badge: 2 },
  { label: "Messages",  href: "/parent/messages",  Icon: MessageSquare, seg: "messages", badge: 3 },
  { label: "More",      href: null,                Icon: LayoutDashboard, seg: "__more" },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getActiveSeg(pathname: string): string | null {
  const segs = pathname.split("/").filter(Boolean);
  if (segs[0] === "parent" && segs.length === 1) return null;
  return segs[1] ?? null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ParentPortalShellProps {
  children:    React.ReactNode;
  parentName:  string;
  userEmail:   string;
  avatarUrl?:  string | null;
  schoolName?: string;
  /** Unread message/notification count */
  unreadCount?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ParentPortalShell({
  children,
  parentName,
  userEmail,
  avatarUrl,
  schoolName: _schoolName,
  unreadCount = 0,
}: ParentPortalShellProps) {
  const pathname   = usePathname();
  const router     = useRouter();
  const activeSeg  = getActiveSeg(pathname);
  const userInits  = initials(parentName);

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [imgError,     setImgError]     = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);

  const showPhoto = !!avatarUrl && !imgError;

  useEffect(() => { setImgError(false); }, [avatarUrl]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // ESC to close drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setDrawerOpen(false); setProfileOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe-to-close drawer
  const touchStartX = useRef(0);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -60) setDrawerOpen(false);
  }, []);

  async function handleLogout() {
    setDrawerOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // ── Zustand child data (client-side) ──────────────────────────────────────
  const children_list  = useParentStore((s) => s.children);
  const activeChildId  = useParentStore((s) => s.activeChildId);
  const setActiveChild = useParentStore((s) => s.setActiveChild);
  const hydrated       = useParentStore((s) => s.hydrated);
  const activeChild    = hydrated
    ? (children_list.find((c) => c.id === activeChildId) ?? children_list[0])
    : null;

  // ── Sidebar link helper ────────────────────────────────────────────────────
  function isActive(seg: string | null): boolean {
    return seg === null ? activeSeg === null : activeSeg === seg;
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-dark-bg">

      {/* ── Fixed top bar ──────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 h-16 z-40 bg-white dark:bg-dark-sidebar
                   border-b border-line dark:border-dark-border flex items-center gap-3 px-4 md:px-6"
      >
        {/* Hamburger — mobile only */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg
                     text-slate hover:bg-teal-50 hover:text-teal transition-colors shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo — visible on mobile only (desktop has sidebar logo) */}
        <Link
          href="/parent"
          aria-label="Bidii Parent Portal home"
          className="md:hidden flex items-center gap-2 shrink-0"
        >
          <Image src="/logo.png" alt="Bidii" width={30} height={30} className="object-contain" />
          <span className="font-bold text-sm text-ink dark:text-dark-text leading-tight">
            BIDII<br />
            <span className="text-[10px] font-normal text-slate dark:text-dark-muted tracking-wide">PARENT PORTAL</span>
          </span>
        </Link>

        {/* Desktop: sidebar takes care of the logo, push content right */}
        <div className="hidden md:block w-56 shrink-0" aria-hidden="true" />

        {/* Search bar — desktop */}
        <div className="hidden md:flex flex-1 max-w-md">
          <button
            type="button"
            onClick={() => {/* TODO: open global search */}}
            className="w-full flex items-center gap-2.5 px-4 py-2 rounded-xl
                       bg-[#F5F7FA] dark:bg-dark-surface border border-line dark:border-dark-border
                       text-slate dark:text-dark-muted text-sm hover:border-teal/40 transition-colors"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span>Search anything…</span>
            <span className="ml-auto text-[11px] opacity-50">⌘K</span>
          </button>
        </div>

        <div className="flex-1 md:flex-none" />

        {/* Notification bell */}
        <ParentNotificationBadge role="parent" />

        {/* Active child chip — desktop */}
        {activeChild && (
          <button
            type="button"
            onClick={() => {
              if (children_list.length > 1) {
                // cycle through children
                const idx = children_list.findIndex((c) => c.id === activeChild.id);
                const next = children_list[(idx + 1) % children_list.length];
                setActiveChild(next.id);
              }
            }}
            className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full
                       border border-line dark:border-dark-border bg-white dark:bg-dark-surface
                       hover:border-teal/40 transition-colors group"
            title={children_list.length > 1 ? "Click to switch child" : activeChild.fullName}
          >
            <div className="w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center shrink-0 overflow-hidden">
              <span className="text-[10px] font-bold text-teal">
                {initials(activeChild.fullName)}
              </span>
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-ink dark:text-dark-text leading-none">{activeChild.fullName}</p>
              <p className="text-[10px] text-slate dark:text-dark-muted leading-none mt-0.5">{activeChild.className}</p>
            </div>
            {children_list.length > 1 && (
              <ChevronDown className="h-3.5 w-3.5 text-slate group-hover:text-teal ml-0.5 transition-colors" />
            )}
          </button>
        )}

        {/* Parent avatar + dropdown */}
        <div className="relative shrink-0" ref={profileRef}>
          <button
            type="button"
            aria-label="Profile menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-teal/30 transition-all"
          >
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl!}
                alt={parentName}
                onError={() => setImgError(true)}
                className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center
                              text-sm font-bold select-none border-2 border-white shadow-sm">
                {userInits}
              </div>
            )}
            <span className="hidden md:block text-sm font-medium text-ink dark:text-dark-text pr-1">
              {parentName.split(" ")[0]}
            </span>
            <ChevronDown className="hidden md:block h-3.5 w-3.5 text-slate" />
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-dark-surface
                         border border-line dark:border-dark-border rounded-xl shadow-lg
                         py-1 z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-line dark:border-dark-border">
                <p className="text-sm font-semibold text-ink dark:text-dark-text">{parentName}</p>
                <p className="text-xs text-slate dark:text-dark-muted mt-0.5 truncate">{userEmail}</p>
              </div>
              <Link
                href="/parent/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate
                           hover:bg-teal-50 hover:text-teal transition-colors"
              >
                <UserCircle2 className="h-4 w-4" /> My Profile
              </Link>
              <Link
                href="/parent/notifications"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate
                           hover:bg-teal-50 hover:text-teal transition-colors"
              >
                <Bell className="h-4 w-4" /> Notifications
                {unreadCount > 0 && (
                  <span className="ml-auto text-xs font-bold text-danger">{unreadCount}</span>
                )}
              </Link>
              <div className="border-t border-line dark:border-dark-border mt-1" />
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate
                           hover:bg-danger/5 hover:text-danger transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        aria-label="Parent portal navigation"
        className="hidden md:flex fixed top-0 left-0 bottom-0 w-56 flex-col z-30
                   bg-white dark:bg-dark-sidebar border-r border-line dark:border-dark-border"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-5 shrink-0 border-b border-line dark:border-dark-border">
          <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0">
            <Image src="/logo.png" alt="Bidii" width={36} height={36} className="object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink dark:text-dark-text tracking-wide">BIDII</p>
            <p className="text-[10px] text-slate dark:text-dark-muted tracking-widest uppercase">
              Parent Portal
            </p>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {PARENT_NAV.map(({ label, href, Icon, seg, ...rest }) => {
            const active  = isActive(seg);
            const hasBadge = "badge" in rest && rest.badge;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                             transition-colors duration-100 group relative
                             ${active
                               ? "bg-teal/10 text-teal dark:bg-teal/15"
                               : "text-[#667085] hover:bg-[#F5F7FA] hover:text-ink dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                             }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-teal" : "text-[#98A2B3] group-hover:text-ink dark:group-hover:text-dark-text"}`}
                  strokeWidth={active ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                <span className="flex-1">{label}</span>
                {hasBadge && unreadCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1
                                   rounded-full bg-teal text-white text-[10px] font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Divider + account section */}
          <div className="pt-4 mt-2 border-t border-line dark:border-dark-border space-y-0.5">
            <p className="px-3 py-1 text-[10px] font-semibold text-slate/60 dark:text-dark-muted/60
                          uppercase tracking-widest select-none">
              Account
            </p>
            <Link
              href="/parent/profile"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                         text-[#667085] hover:bg-[#F5F7FA] hover:text-ink transition-colors
                         dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
            >
              <Settings className="h-[18px] w-[18px] shrink-0 text-[#98A2B3]" strokeWidth={1.8} />
              Settings
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                         text-[#667085] hover:bg-danger/5 hover:text-danger transition-colors
                         dark:text-dark-muted dark:hover:text-danger"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0 text-[#98A2B3]" strokeWidth={1.8} />
              Sign out
            </button>
          </div>
        </nav>

        {/* Child card at the bottom of sidebar */}
        {activeChild && (
          <div className="shrink-0 border-t border-line dark:border-dark-border px-3 py-4 space-y-2">
            <p className="px-1 text-[10px] font-semibold text-slate/60 dark:text-dark-muted/60
                          uppercase tracking-widest select-none">
              My Child
            </p>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5F7FA] dark:bg-dark-surface border border-line dark:border-dark-border">
              {/* Student avatar placeholder */}
              <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center
                              shrink-0 border-2 border-white dark:border-dark-border shadow-sm overflow-hidden">
                <span className="text-xs font-bold text-teal">
                  {initials(activeChild.fullName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink dark:text-dark-text truncate leading-tight">
                  {activeChild.fullName}
                </p>
                <p className="text-[11px] text-slate dark:text-dark-muted truncate leading-tight">
                  {activeChild.className} · Adm #{activeChild.admissionNumber}
                </p>
              </div>
              {children_list.length > 1 && (
                <ChevronDown className="h-4 w-4 text-slate shrink-0" />
              )}
            </div>

            {children_list.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const idx  = children_list.findIndex((c) => c.id === activeChild.id);
                  const next = children_list[(idx + 1) % children_list.length];
                  setActiveChild(next.id);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                           text-xs font-medium text-teal bg-teal/5 hover:bg-teal/10 transition-colors
                           border border-teal/20"
              >
                <UserCircle2 className="h-3.5 w-3.5" />
                Switch child
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Mobile slide-in drawer ─────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-white dark:bg-dark-sidebar shadow-xl"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-line dark:border-dark-border">
              <Link href="/parent" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2.5">
                <Image src="/logo.png" alt="Bidii" width={32} height={32} className="object-contain" />
                <div>
                  <p className="text-sm font-bold text-ink dark:text-dark-text leading-none">BIDII</p>
                  <p className="text-[10px] text-slate dark:text-dark-muted tracking-widest">PARENT PORTAL</p>
                </div>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate
                           hover:bg-teal-50 hover:text-teal transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Child chip in drawer */}
            {activeChild && (
              <div className="px-4 py-3 border-b border-line dark:border-dark-border">
                <div className="flex items-center gap-3 bg-[#F5F7FA] dark:bg-dark-surface
                                rounded-xl px-3 py-2.5 border border-line dark:border-dark-border">
                  <div className="w-9 h-9 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-teal">{initials(activeChild.fullName)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">{activeChild.fullName}</p>
                    <p className="text-xs text-slate dark:text-dark-muted truncate">{activeChild.className} · Adm #{activeChild.admissionNumber}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {PARENT_NAV.map(({ label, href, Icon, seg, ...rest }) => {
                const active   = isActive(seg);
                const hasBadge = "badge" in rest && rest.badge;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3.5 w-full px-3 py-3 rounded-xl text-sm
                                font-medium transition-colors min-h-[44px]
                                ${active
                                  ? "bg-teal/10 text-teal"
                                  : "text-slate hover:bg-[#F5F7FA] hover:text-ink dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                                }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    {hasBadge && unreadCount > 0 && (
                      <span className="text-xs font-bold text-danger">{unreadCount}</span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="shrink-0 border-t border-line dark:border-dark-border px-4 py-4"
                 style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}>
              <div className="flex items-center gap-3 mb-3 px-1">
                {showPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl!} alt={parentName} onError={() => setImgError(true)}
                       className="w-9 h-9 rounded-full object-cover border border-line shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center
                                  text-xs font-semibold shrink-0">
                    {userInits}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{parentName}</p>
                  <p className="text-xs text-slate dark:text-dark-muted truncate">{userEmail}</p>
                </div>
              </div>
              <Link
                href="/parent/profile"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium
                           text-slate hover:bg-teal-50 hover:text-teal transition-colors mb-1 min-h-[44px]"
              >
                <UserCircle2 className="h-5 w-5 shrink-0" strokeWidth={1.8} /> My Profile
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium
                           text-slate hover:bg-danger/5 hover:text-danger transition-colors min-h-[44px]"
              >
                <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.8} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content area ────────────────────────────────────────────── */}
      <main
        className="md:pl-56 pt-16 pb-20 md:pb-0 min-h-screen"
        id="main-content"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 h-[68px] z-40
                   bg-white dark:bg-dark-sidebar border-t border-line dark:border-dark-border
                   flex items-start pt-2 px-1 gap-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {BOTTOM_TABS.map(({ label, href, Icon, seg, ...rest }) => {
          const badgeCount = "badge" in rest ? (rest as { badge?: number }).badge ?? 0 : 0;
          const active = href
            ? (seg === null ? activeSeg === null : activeSeg === seg)
            : false;

          if (!href) {
            // "More" button opens the drawer
            return (
              <button
                key="more"
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex-1 flex flex-col items-center gap-1 py-1 text-slate
                           hover:text-teal transition-colors"
                aria-label="More"
              >
                <Icon className="h-6 w-6" strokeWidth={1.8} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors relative
                          ${active ? "text-teal" : "text-slate hover:text-teal"}`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                {badgeCount > 0 && (
                  <span
                    aria-label={`${badgeCount} unread`}
                    className="absolute -top-1 -right-1.5 flex items-center justify-center
                               min-w-[16px] h-4 px-0.5 rounded-full
                               bg-danger text-white text-[9px] font-bold leading-none"
                  >
                    {badgeCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5
                             bg-teal rounded-full"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
