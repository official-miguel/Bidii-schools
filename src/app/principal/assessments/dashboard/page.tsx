import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardCharts from "@/components/assessment/DashboardCharts";
import CbeDashboardEnhanced from "@/components/assessment/CbeDashboardEnhanced";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const allClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicableForms: true },
  });

  const cbeClasses  = allClasses.filter((c) => c.frameworkType === "CBE");
  const kcseClasses = allClasses.filter((c) => c.frameworkType !== "CBE");
  const hasBoth     = cbeClasses.length > 0 && kcseClasses.length > 0;
  const hasCbeOnly  = cbeClasses.length > 0 && kcseClasses.length === 0;

  const tab = searchParams.tab ?? (hasCbeOnly ? "cbe" : "844");

  // Mixed school: render side-by-side tabs
  if (hasBoth) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">In-depth Analysis</h1>
          <p className="text-sm text-slate mt-0.5">Unified view across 8-4-4 and CBE classes.</p>
        </div>

        {/* Framework tabs */}
        <div className="flex gap-1 mb-6 border-b border-line">
          {[
            { key: "844",  label: `8-4-4 / KCSE  (${kcseClasses.length} class${kcseClasses.length !== 1 ? "es" : ""})` },
            { key: "cbe",  label: `CBE  (${cbeClasses.length} class${cbeClasses.length !== 1 ? "es" : ""})` },
            { key: "both", label: "Side-by-side" },
          ].map(({ key, label }) => (
            <a
              key={key}
              href={`?tab=${key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-ink text-ink"
                  : "border-transparent text-slate hover:text-ink"
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        {/* 8-4-4 only */}
        {tab === "844" && (
          <DashboardCharts
            classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
            subjects={subjects}
          />
        )}

        {/* CBE only */}
        {tab === "cbe" && (
          <CbeDashboardEnhanced
            classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
            cbeOnly={false}
          />
        )}

        {/* Side-by-side */}
        {tab === "both" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                <span className="inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">8-4-4</span>
                KCSE classes
              </h2>
              <DashboardCharts
                classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
                subjects={subjects}
              />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                <span className="inline-block rounded-full bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5">CBE</span>
                CBE classes
              </h2>
              <CbeDashboardEnhanced
                classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
                cbeOnly={false}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // CBE-only school
  if (hasCbeOnly) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">In-depth Analysis</h1>
          <p className="text-sm text-slate mt-0.5">CBE attainment — performance levels by sub-strand, learning area, and pathway.</p>
        </div>
        <CbeDashboardEnhanced
          classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
          cbeOnly={false}
        />
      </div>
    );
  }

  // 8-4-4-only school (default)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">In-depth Analysis</h1>
        <p className="text-sm text-slate mt-0.5">Aggregate performance metrics across periods, classes, and subjects.</p>
      </div>
      <DashboardCharts
        classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
        subjects={subjects}
      />
    </div>
  );
}
