"use client";

/**
 * src/components/TopAppBar.tsx
 *
 * Fixed global top bar — Stage 9 updated.
 *
 * Changes vs Stage 8:
 *   - Hamburger menu button (mobile only, left edge) opens MobileDrawer via
 *     MobileDrawerContext — no bottom nav bar any more.
 *   - All icon buttons enlarged to 44px tap targets (w-11 h-11).
 *   - Desktop search pill and profile chip remain unchanged.
 *
 * v3 changes:
 *   - Accepts optional `avatarUrl` prop — shows user photo in the top-right
 *     avatar button when available, falls back to initials.
 *   - Profile dropdown now includes a "My Profile" link.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Search, ChevronDown, LogOut, Menu, UserCircle2 } from "lucide-react";

const ActiveChildBar = dynamic(
  () => import("@/components/parent/ActiveChildBar"),
  { ssr: false }
);

const ParentNotificationBadge = dynamic(
  () => import("@/components/parent/ParentNotificationBadge"),
  { ssr: false }
);
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import GlobalSearchModal from "@/components/GlobalSearchModal";
import NotificationCenter, { NotificationBell } from "@/components/NotificationCenter";
import QuickActionsPanel, { QuickActionsButton } from "@/components/QuickActionsPanel";

export interface QuickAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

interface Props {
  userEmail: string;
  roleLabel: string;
  userInitials: string;
  /** Optional profile photo URL — shown in the avatar button when available. */
  avatarUrl?: string | null;
  schoolName?: string;
  /** Routing role prefix: "principal" | "teacher" | "staff" | "parent" */
  role?: string;
  /** Legacy per-layout quick actions — kept for backward compat */
  quickActions?: QuickAction[];
}

export default function TopAppBar({
  userEmail,
  roleLabel,
  userInitials,
  avatarUrl,
  schoolName,
  role = "principal",
  quickActions: _quickActions = [],
}: Props) {
  const { toggle: toggleDrawer } = useMobileDrawer();
  const router = useRouter();
  const [searchOpen,       setSearchOpen]       = useState(false);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [profileOpen,      setProfileOpen]      = useState(false);
  const [imgError,         setImgError]         = useState(false);

  const profileRef      = useRef<HTMLDivElement>(null);
  const notifRef        = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  // Reset img error when avatarUrl changes (new photo uploaded elsewhere)
  useEffect(() => { setImgError(false); }, [avatarUrl]);

  /* ── Keyboard shortcuts ─────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setNotifOpen(false);
        setQuickActionsOpen(false);
        setProfileOpen(false);
        return;
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setQuickActionsOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Profile dropdown outside-click ─────────────────────────────────── */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  /* ── Quick actions outside-click ─────────────────────────────────────── */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setQuickActionsOpen(false);
      }
    }
    if (quickActionsOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickActionsOpen]);

  /* ── Mutual exclusion ───────────────────────────────────────────────── */
  function openNotif() {
    setNotifOpen((v) => !v);
    setQuickActionsOpen(false);
    setProfileOpen(false);
  }

  function openQuickActions() {
    setQuickActionsOpen((v) => !v);
    setNotifOpen(false);
    setProfileOpen(false);
  }

  function openProfile() {
    setProfileOpen((v) => !v);
    setNotifOpen(false);
    setQuickActionsOpen(false);
  }

  async function handleLogout() {
    setProfileOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const profileHref = `/${role}/profile`;
  const showPhoto   = !!avatarUrl && !imgError;

  const iconBtn = `flex items-center justify-center w-11 h-11 rounded-lg
                   transition-colors duration-100
                   text-slate hover:bg-teal-50 hover:text-teal
                   dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text`;

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 right-0 z-30 h-16 flex items-center gap-1 px-2 sm:px-4
                   bg-white/95 backdrop-blur-sm border-b border-line
                   dark:bg-dark-sidebar/95 dark:border-dark-border
                   md:left-16 left-0"
      >
        {/* ── Hamburger (mobile only) ─────────────────────────────────── */}
        <button
          type="button"
          onClick={toggleDrawer}
          aria-label="Open navigation menu"
          className={`md:hidden ${iconBtn}`}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* ── Mobile logo / school name ───────────────────────────────── */}
        <div className="md:hidden flex items-center gap-2 mx-1">
          <div className="h-7 w-7 rounded overflow-hidden shrink-0">
            <Image
              src="/logo.png"
              alt="Bidii KE"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-sm text-ink dark:text-dark-text truncate max-w-[140px] xs:max-w-[180px]">
            {schoolName ?? "Bidii"}
          </span>
        </div>

        {/* ── Search trigger (desktop pill) ───────────────────────────── */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 h-9 pl-3 pr-4 rounded-lg
                     bg-paper border border-line text-slate text-sm
                     hover:border-teal/40 hover:text-ink transition-colors
                     dark:bg-dark-surface dark:border-dark-border
                     dark:text-dark-muted dark:hover:text-dark-text"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">Search…</span>
          <kbd className="ml-3 text-[10px] font-medium text-slate/60 bg-line
                          rounded px-1.5 py-0.5 dark:bg-dark-border dark:text-dark-muted">
            ⌘K
          </kbd>
        </button>

        {/* ── Active child chip (parent role only) ────────────────────── */}
        {role === "parent" && <ActiveChildBar />}

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Mobile search icon ──────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className={`md:hidden ${iconBtn}`}
        >
          <Search className="h-5 w-5" />
        </button>

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <div ref={quickActionsRef} className="relative">
          <QuickActionsButton
            onClick={openQuickActions}
            isOpen={quickActionsOpen}
          />
          <QuickActionsPanel
            isOpen={quickActionsOpen}
            onClose={() => setQuickActionsOpen(false)}
            role={role}
          />
        </div>

        {/* ── Notifications ────────────────────────────────────────────── */}
        {role === "parent" ? (
          <ParentNotificationBadge
            role={role}
            onClick={openNotif}
            isOpen={notifOpen}
          />
        ) : (
          <div ref={notifRef} className="relative">
            <NotificationBell
              onClick={openNotif}
              isOpen={notifOpen}
            />
            <NotificationCenter
              isOpen={notifOpen}
              onClose={() => setNotifOpen(false)}
            />
          </div>
        )}

        {/* ── User profile ─────────────────────────────────────────────── */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={openProfile}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 h-11 pl-1 pr-2.5 rounded-lg
                       hover:bg-teal-50 transition-colors group
                       dark:hover:bg-dark-border"
          >
            {/* Avatar: photo or initials */}
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl!}
                alt={roleLabel}
                onError={() => setImgError(true)}
                className="w-8 h-8 rounded-full object-cover border border-line shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full bg-teal text-white text-xs font-semibold
                           flex items-center justify-center select-none shrink-0"
              >
                {userInitials}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-ink leading-none dark:text-dark-text">
                {roleLabel}
              </p>
            </div>
            <ChevronDown
              className={`hidden sm:block h-3 w-3 text-slate transition-transform duration-150
                         dark:text-dark-muted ${profileOpen ? "rotate-180" : ""}`}
            />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-56 rounded-xl
                         bg-white border border-line shadow-lg
                         dark:bg-dark-surface dark:border-dark-border
                         animate-scale-in origin-top-right z-50"
            >
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line dark:border-dark-border">
                {showPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl!}
                    alt={roleLabel}
                    className="w-9 h-9 rounded-full object-cover border border-line shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-teal text-white text-sm font-semibold
                                  flex items-center justify-center select-none shrink-0">
                    {userInitials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                    {roleLabel}
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted truncate mt-0.5">
                    {userEmail}
                  </p>
                </div>
              </div>

              <div className="p-1.5 space-y-0.5">
                {/* My Profile link */}
                <Link
                  href={profileHref}
                  onClick={() => setProfileOpen(false)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5
                             text-sm text-slate hover:bg-teal-50 hover:text-teal
                             transition-colors dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-teal
                             min-h-[44px]"
                >
                  <UserCircle2 className="h-4 w-4 shrink-0" />
                  My Profile
                </Link>

                {/* Sign out */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5
                             text-sm text-slate hover:bg-danger/5 hover:text-danger
                             transition-colors dark:text-dark-muted dark:hover:text-danger
                             min-h-[44px]"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Global Search Modal ──────────────────────────────────────────── */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        role={role}
      />
    </>
  );
}
