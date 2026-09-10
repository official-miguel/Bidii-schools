"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";

interface DisciplineRecordSummary {
  id: string;
  offence: string;
  status: string;
  createdAt: string;
}

export default function StudentDisciplineProfile({ studentId }: { studentId: string }) {
  const [records, setRecords] = useState<DisciplineRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/students/${studentId}/discipline`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data);
        setLoading(false);
      });
  }, [studentId]);

  if (loading) return <p className="text-sm text-slate">Loading discipline records…</p>;

  return (
    <div>
      <PageHeader title="Discipline Records" description="All discipline cases for this student." />
      {records.length === 0 ? (
        <p className="text-sm text-slate">No discipline records.</p>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{r.offence}</p>
                  <p className="text-sm text-slate">
                    {new Date(r.createdAt).toLocaleDateString()} • {r.status} •
                    <a href={`/principal/records/discipline/${r.id}`} className="text-royal hover:underline ml-2">
                      View
                    </a>
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === "OPEN" ? "bg-warn-bg text-warn" : "bg-success-bg text-success"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}