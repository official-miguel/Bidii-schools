import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import DisciplineCaseClient from "./DisciplineCaseClient";

export default async function DisciplineCasePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/");

  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true, form: true } },
        },
      },
      recordedBy: {
        select: { email: true, role: true, teacher: { select: { fullName: true } } },
      },
      caseNotes: {
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { email: true, role: true, teacher: { select: { fullName: true } } },
          },
        },
      },
      events: false,
      files: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!record) notFound();

  // Normalise the user shape for the client component
  function normUser(u: { email: string; role: string; teacher: { fullName: string } | null } | null) {
    if (!u) return null;
    return { email: u.email, role: u.role, name: u.teacher?.fullName ?? null };
  }

  return (
    <div>
      <PageHeader
        title={`Discipline Case: ${record.offence}`}
        description={`${record.student.fullName} (${record.student.admissionNumber}) — ${record.student.schoolClass.name}`}
      />

      <DisciplineCaseClient
        record={{
          id:          record.id,
          offence:     record.offence,
          status:      record.status,
          description: record.description,
          actionTaken: record.actionTaken,
          resolution:  record.resolution,
          createdAt:   record.createdAt.toISOString(),
          recordedBy:  normUser(record.recordedBy),
          student:     record.student,
        }}
        initialNotes={record.caseNotes.map((n) => ({
          id:        n.id,
          body:      n.body,
          createdAt: n.createdAt.toISOString(),
          createdBy: normUser(n.createdBy),
        }))}
        initialFiles={record.files.map((f) => ({
          ...f,
          createdAt: f.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
