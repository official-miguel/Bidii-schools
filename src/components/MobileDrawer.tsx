"use client";

/**
 * MobileDrawer — permission-aware full-height slide-in navigation drawer.
 *
 * v2 changes:
 *  - Accepts optional `visibleHubs` prop (Set<NavHub>). Hubs not in the set
 *    are hidden — no disabled states, no empty gaps.
 *  - Dashboard is always shown.
 *  - All gesture, focus-trap, keyboard, and animation behaviour unchanged.
 *
 * v3 changes:
 *  - Accepts optional `avatarUrl` prop — shows photo in footer when available.
 *  - Footer now includes a "My Profile" link above sign-out.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  X,
  Home,
  Users,
  GraduationCap,
  Star,
  CalendarDays,
  MessageSquare,
  Settings,
  LogOut,
  UserCircle2,
} from "lucide-react";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import { getActiveHub } from "@/components/HubSidebar";
import type { NavHub } from "@/lib/permissions";

const HUB_DEFS = [
  { id: "dashboard"      as NavHub, label: "Dashboard",     Icon: Home,          seg: null },
  { id: "academic"       as NavHub, label: "Academic",       Icon: GraduationCap, seg: "academics" },
  { id: "people"         as NavHub, label: "People",         Icon: Users,         seg: "people" },
  { id: "student-life"   as NavHub, label: "Student Life",   Icon: Star,          seg: "accommodation" },
  { id: "calendar"       as NavHub, label: "Calendar",       Icon: CalendarDays,  seg: "calendar" },
  { id: "communication"  as NavHub, label: "Communication",  Icon: MessageSquare, seg: "communication" },
  { id: "administration" as NavHub, label: "Administration", Icon: Settings,      seg: "administration" },
] as const;

function initials(label: string, email: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

interface MobileDrawerProps {
  role:         string;
  roleLabel:    string;
  userEmail:    string;
  schoolName?:  string;
  avatarUrl?:   string | null;
  visibleHubs?: Set<NavHub>;
}

export default function MobileDrawer({
  role,
  roleLabel,
  userEmail,
  schoolName,
  avatarUrl,
  visibleHubs,
}: MobileDrawerProps) {
  const { isOpen, close } = useMobileDrawer();
  const pathname   = usePathname();
  const router     = useRouter();
  const panelRef   = useRef<HTMLDivElement>(null);
  const activeHub  = getActiveHub(pathname);
  const userInits  = initials(roleLabel, userEmail);
  const profileHref = `/${role}/profile`;

  const shouldShow = (hubId: NavHub) =>
    !visibleHubs || hubId === "dashboard" || visibleHubs.has(hubId);

  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [imgError,  setImgError]  = useState(false);

  useEffect(() => { setImgError(false); }, [avatarUrl]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    } else if (isVisible) {
      setIsClosing(true);
      const t = setTimeout(() => { setIsVisible(false); setIsClosing(false); }, 240);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
      else            { if (document.activeElement === last)  { e.preventDefault(); first?.focus(); } }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [isOpen]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const SWIPE_THRESHOLD = 60;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dx < -SWIPE_THRESHOLD && dy < 80) close();
  }, [close]);

  const handleNavClick = () => setTimeout(close, 80);

  async function handleLogout() {
    close();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const showPhoto = !!avatarUrl && !imgError;

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${isClosing ? "pointer-events-none" : ""}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-ink/50 backdrop-blur-[2px] transition-opacity duration-240
                    ${isClosing ? "opacity-0" : "opacity-100"}`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-white dark:bg-dark-sidebar shadow-xl
                    ${isClosing ? "drawer-exit" : "drawer-enter"}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-line dark:border-dark-border"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <Link
            href={`/${role}`}
            onClick={handleNavClick}
            className="flex items-center gap-2.5"
            aria-label={`${schoolName ?? "Bidii"} home`}
          >
            <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
              <Image src="/logo.png" alt="Bidii KE" width={32} height={32} className="object-contain" />
            </div>
            <span className="font-semibold text-sm text-ink dark:text-dark-text truncate max-w-[160px]">
              {schoolName ?? "Bidii"}
            </span>
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-slate
                       hover:bg-teal-50 hover:text-teal transition-colors shrink-0
                       dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nav links — only permitted hubs */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3 px-3">
          <p className="px-3 mb-2 text-[10px] font-semibold text-slate/60 uppercase tracking-widest dark:text-dark-muted">
            Navigation
          </p>
          {HUB_DEFS.filter(({ id }) => shouldShow(id)).map(({ id, label, Icon, seg }) => {
            const href   = seg ? `/${role}/${seg}` : `/${role}`;
            const active = activeHub === id;
            return (
              <Link
                key={id}
                href={href}
                onClick={handleNavClick}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3.5 w-full px-3 py-3 rounded-xl mb-0.5
                  text-sm font-medium transition-colors min-h-[44px]
                  ${active
                    ? "bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal"
                    : "text-slate hover:bg-teal-50 hover:text-teal dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                  }`}
              >
                <span aria-hidden="true"
                  className={`w-1 h-5 rounded-full shrink-0 transition-colors ${active ? "bg-teal" : "bg-transparent"}`}
                />
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="shrink-0 border-t border-line dark:border-dark-border px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {/* User identity row */}
          <div className="flex items-center gap-3 mb-3 px-1">
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl!}
                alt={roleLabel}
                onError={() => setImgError(true)}
                className="w-9 h-9 rounded-full object-cover border border-line shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center
                              text-xs font-semibold shrink-0 select-none">
                {userInits}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink dark:text-dark-text truncate leading-tight">{roleLabel}</p>
              <p className="text-xs text-slate dark:text-dark-muted truncate leading-tight">{userEmail}</p>
            </div>
          </div>

          {/* My Profile link */}
          <Link
            href={profileHref}
            onClick={handleNavClick}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl min-h-[44px]
                       text-sm font-medium text-slate hover:bg-teal-50 hover:text-teal
                       transition-colors dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-teal mb-1"
          >
            <UserCircle2 className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            My Profile
          </Link>

          {/* Sign out */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl min-h-[44px]
                       text-sm font-medium text-slate hover:bg-danger/5 hover:text-danger
                       transition-colors dark:text-dark-muted dark:hover:text-danger"
          >
            <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
