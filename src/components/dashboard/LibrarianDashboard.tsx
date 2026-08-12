import Link from "next/link";
import { BookOpen, Clock, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import type { User } from "@prisma/client";

interface Props { user: User }

export default async function LibrarianDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  const [
    totalBooks,
    totalCopies,
    booksOut,
    overdueCount,
    finesOutstanding,
    studentsWithFines,
    totalCards,
    recentBorrows,
    topOverdue,
  ] = await Promise.all([
    prisma.libraryCatalogue.count({ where: { schoolId, archivedAt: null } }).catch(() =>
      prisma.libraryBook.count({ where: { schoolId } })
    ),
    prisma.libraryCopy.count({ where: { schoolId, status: "BORROWED" } }).catch(() => 0),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null } }),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null, dueAt: { lt: today } } }),
    prisma.libraryCard.aggregate({ where: { schoolId }, _sum: { fineBalance: true } }),
    prisma.libraryCard.count({ where: { schoolId, fineBalance: { gt: 0 } } }),
    prisma.libraryCard.count({ where: { schoolId } }),
    prisma.libraryBorrow.findMany({
      where: { schoolId, returnedAt: null },
      orderBy: { borrowedAt: "desc" },
      take: 8,
      select: {
        id: true, borrowedAt: true, dueAt: true,
        card: { select: { student: { select: { fullName: true, admissionNumber: true } } } },
        book: { select: { title: true } },
      },
    }),
    // Top overdue borrows
    prisma.libraryBorrow.findMany({
      where: { schoolId, returnedAt: null, dueAt: { lt: today } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true, dueAt: true,
        card: { select: { student: { select: { fullName: true, admissionNumber: true } } } },
        book: { select: { title: true } },
      },
    }),
  ]);

  const finesTotal = Number(finesOutstanding._sum.fineBalance ?? 0);

  const alerts: AlertItem[] = [];
  if (overdueCount > 0)
    alerts.push({ id: "ov", type: "danger", href: "/staff/library?filter=overdue", message: `${overdueCount} overdue book${overdueCount > 1 ? "s" : ""} not yet returned.` });
  if (studentsWithFines > 0)
    alerts.push({ id: "fi", type: "warn",   href: "/staff/library?filter=fines",   message: `${studentsWithFines} student${studentsWithFines > 1 ? "s" : ""} with outstanding fines totalling KES ${finesTotal.toLocaleString()}.` });

  const quickLinks: QuickLink[] = [
    { label: "Issue book",         href: "/staff/library/issue",     icon: "BookOpen" },
    { label: "Return book",        href: "/staff/library/return",    icon: "CornerDownLeft" },
    { label: "Student lookup",     href: "/staff/library/cards",     icon: "Users" },
    { label: "Add book",           href: "/staff/library/catalogue", icon: "Plus" },
    { label: "Manage fines",       href: "/staff/library/fines",     icon: "DollarSign" },
    { label: "Inventory",          href: "/staff/library/copies",    icon: "Archive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Library — Circulation Desk</h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total titles"     value={totalBooks}    href="/staff/library/catalogue" icon={BookOpen}      color="teal" />
        <StatCard label="Books out"        value={booksOut}      href="/staff/library?filter=out" icon={TrendingUp}   color="info" />
        <StatCard label="Overdue"          value={overdueCount}  href="/staff/library?filter=overdue" icon={AlertTriangle}
                  color={overdueCount > 0 ? "danger" : "success"}
                  badge={overdueCount > 0 ? `${overdueCount} overdue` : "All on time"} badgeColor={overdueCount > 0 ? "danger" : "success"} />
        <StatCard label="Active cards"     value={totalCards}    href="/staff/library/cards"     icon={CheckCircle}   color="teal" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Fines outstanding" value={`KES ${finesTotal.toLocaleString()}`}
                  href="/staff/library/fines" icon={Clock} color={finesTotal > 0 ? "warn" : "success"}
                  sub={`${studentsWithFines} students`} />
        <StatCard label="Copies out"       value={totalCopies}   href="/staff/library?filter=out" icon={BookOpen} color="teal" />
        <div className="col-span-2">
          <QuickLinkGrid links={quickLinks.slice(0, 4)} title="" />
        </div>
      </div>

      {/* Active borrows */}
      <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink dark:text-dark-text">Recent borrows</p>
          <Link href="/staff/library?filter=out" className="text-xs text-teal hover:underline">View all {booksOut}</Link>
        </div>
        {recentBorrows.length === 0 ? (
          <p className="text-sm text-slate dark:text-dark-muted">No books currently out.</p>
        ) : (
          <div className="space-y-2">
            {recentBorrows.map((b) => {
              const isOverdue = new Date(b.dueAt) < today;
              return (
                <div key={b.id} className="flex items-center justify-between text-sm gap-3">
                  <div className="min-w-0">
                    <p className="text-ink dark:text-dark-text truncate">{b.book?.title ?? "—"}</p>
                    <p className="text-xs text-slate dark:text-dark-muted">
                      {b.card.student?.fullName} · #{b.card.student?.admissionNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-medium ${isOverdue ? "text-danger" : "text-slate dark:text-dark-muted"}`}>
                      Due {new Date(b.dueAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                    </p>
                    {isOverdue && <span className="text-[10px] bg-danger-bg text-danger px-1.5 py-0.5 rounded-full">Overdue</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top overdue */}
      {topOverdue.length > 0 && (
        <div className="bg-danger-bg border border-danger/20 rounded-xl p-5">
          <p className="text-sm font-semibold text-danger mb-3">Most overdue — action needed</p>
          <div className="space-y-2">
            {topOverdue.map((b) => {
              const daysLate = Math.floor((today.getTime() - new Date(b.dueAt).getTime()) / 86400000);
              return (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="text-ink dark:text-dark-text truncate">{b.book?.title ?? "—"}</p>
                    <p className="text-xs text-slate dark:text-dark-muted">{b.card.student?.fullName}</p>
                  </div>
                  <span className="text-xs font-semibold text-danger shrink-0">{daysLate}d overdue</span>
                </div>
              );
            })}
          </div>
          <Link href="/staff/library?filter=overdue" className="mt-3 inline-block text-xs text-teal hover:underline">
            Process returns →
          </Link>
        </div>
      )}

      <QuickLinkGrid links={quickLinks} title="Circulation actions" />
    </div>
  );
}
