"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";

interface ChildCard {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  periodId: string | null;
  periodName: string | null;
  latestReportUrl: string | null;
}

interface ParentHomeData {
  children: ChildCard[];
}

export default function ParentHome() {
  const [data, setData] = useState<ParentHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assessments/home/parent")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load your child's information."));
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-line/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.children.length === 0) {
    return (
      <EmptyState message="No children linked to your account. Contact the school to link your child." />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {data.children.map((child) => (
        <div
          key={child.studentId}
          className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-3"
        >
          <div>
            <p className="font-semibold text-foreground text-base">{child.fullName}</p>
            <p className="text-xs text-slate mt-0.5">
              {child.className} &middot; Adm. {child.admissionNumber}
            </p>
          </div>

          {child.periodName && (
            <p className="text-xs text-slate">
              Latest period:{" "}
              <span className="font-medium text-foreground">{child.periodName}</span>
            </p>
          )}

          <div className="flex gap-2 mt-auto">
            {child.latestReportUrl ? (
              <Link
                href={child.latestReportUrl}
                className="rounded-md bg-royal text-white text-xs font-medium px-3 py-2 hover:bg-royal/90 transition-colors"
              >
                View Report
              </Link>
            ) : (
              <span className="text-xs text-slate italic">No report available yet</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
