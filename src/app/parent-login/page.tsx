/**
 * Parent login page — phone number + child admission number.
 *
 * Visually matches the staff login page (teal gradient card, dot-grid
 * background, logo). Renders as a React Server Component so the schoolId
 * can be resolved server-side and injected as a hidden field before the
 * browser receives any HTML.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { resolveSchoolId } from "./actions";
import ParentLoginForm from "./ParentLoginForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { school?: string };
}

export default async function ParentLoginPage({ searchParams }: PageProps) {
  const slug = searchParams.school ?? null;
  const schoolId = await resolveSchoolId(slug);

  return (
    <div
      className={
        "min-h-screen flex items-center justify-center px-4 relative overflow-hidden " +
        "bg-gradient-to-br from-teal-50/60 via-white to-slate-50 " +
        "dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]"
      }
    >
      {/* Dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #2C7F7E 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Glow orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-0 dark:opacity-[0.08]"
        style={{
          background: "radial-gradient(circle, #2C7F7E, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-teal/10 dark:bg-white/10 ring-1 ring-teal/20 dark:ring-white/20 p-4 mb-5 shadow-md">
            <Image
              src="/logo.png"
              alt="Bidii"
              width={72}
              height={72}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white tracking-tight">
            Parent Portal
          </h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1">
            Sign in to view your child&apos;s school information
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div
            className="h-0.5"
            style={{
              background:
                "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)",
            }}
          />
          <div className="p-7">
            <Suspense fallback={null}>
              <ParentLoginForm schoolId={schoolId} />
            </Suspense>
          </div>
        </div>

        {/* Staff portal link */}
        <div className="mt-5 text-center">
          <Link
            href="/login"
            className={
              "inline-flex items-center gap-1.5 text-xs text-slate dark:text-white/40 " +
              "hover:text-teal dark:hover:text-teal transition-colors group"
            }
          >
            <ShieldCheck
              className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-opacity"
              aria-hidden="true"
            />
            Staff? Sign in to the Staff Portal
          </Link>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-4">
          Need help signing in? Contact your school administrator.
        </p>
      </div>
    </div>
  );
}
