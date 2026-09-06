/**
 * src/lib/messaging/examResults.ts
 *
 * Builds a personalised exam-results message for a single student.
 * Fetches published AssessmentItem rows, formats the /results block
 * for both 8-4-4 (numeric) and CBE (performance level), then applies
 * all placeholders.
 *
 * SERVER-SIDE ONLY.
 */

import { prisma } from "@/lib/prisma";
import { applyPlaceholders, extractStream } from "./placeholders";

export type ResultsMessagePayload = {
  body:           string;
  recipientLabel: string;
  phone:          string | null;
};

export async function buildResultsMessage(
  studentId: string,
  periodId:  string,
  schoolId:  string,
  closing:   string
): Promise<ResultsMessagePayload> {
  // Fetch student with class info
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      fullName:       true,
      admissionNumber:true,
      parentContact:  true,
      schoolClass: {
        select: { name: true, form: true, stream: true },
      },
    },
  });

  if (!student) {
    return { body: "", recipientLabel: "Unknown", phone: null };
  }

  // Fetch period + framework
  const period = await prisma.assessmentPeriod.findUnique({
    where: { id: periodId },
    select: { name: true, framework: { select: { type: true } } },
  });

  // Fetch all assessment items for this student in this period
  const items = await prisma.assessmentItem.findMany({
    where: { studentId, periodId, schoolId },
    select: {
      numericScore:     true,
      performanceLevel: true,
      competencyStatus: true,
      resultKind:       true,
      subject:    { select: { name: true } },
      paper:      { select: { name: true } },
      learningArea: { select: { name: true } },
      strand:     { select: { name: true } },
      subStrand:  { select: { name: true } },
    },
    orderBy: [
      { subject: { name: "asc" } },
      { learningArea: { name: "asc" } },
    ],
  });

  const resultsLines: string[] = [];

  if (period?.framework?.type === "CBE" && items.some(i => i.performanceLevel)) {
    // CBE junior: group by learning area → strand → sub-strand
    const grouped = new Map<string, { strand: string; subStrand: string; level: string }[]>();
    for (const item of items) {
      const area = item.learningArea?.name ?? "Unknown Area";
      if (!grouped.has(area)) grouped.set(area, []);
      grouped.get(area)!.push({
        strand:    item.strand?.name    ?? "",
        subStrand: item.subStrand?.name ?? "",
        level:     item.performanceLevel ?? "N/A",
      });
    }
    for (const [area, entries] of grouped) {
      resultsLines.push(area);
      for (const e of entries) {
        const node = e.subStrand || e.strand || "—";
        resultsLines.push(`  ${node}: ${e.level}`);
      }
    }
  } else {
    // 8-4-4 / CBE: list subject / paper scores
    for (const item of items) {
      const subjectName = item.subject?.name ?? item.learningArea?.name ?? "Unknown";
      const paperSuffix = item.paper?.name ? ` (${item.paper.name})` : "";
      let score = "—";
      if (item.resultKind === "NUMERIC" && item.numericScore !== null) {
        score = String(item.numericScore);
      } else if (item.resultKind === "COMPETENCY_STATUS") {
        score = item.competencyStatus === "COMPETENT" ? "Competent" : "Not Yet Competent";
      }
      resultsLines.push(`${subjectName}${paperSuffix}: ${score}`);
    }
  }

  const resultsBlock = resultsLines.length > 0
    ? resultsLines.join("\n")
    : "No results available.";

  const className  = student.schoolClass?.name  ?? "";
  const streamName = student.schoolClass?.stream ?? extractStream(className);

  const templateBody =
    `Dear Parent/Guardian,\n\nHere are the ${period?.name ?? "exam"} results for /name:\n\nClass: /class\nAdmission No: /Admission\n\n/results\n\n${closing}`;

  const body = applyPlaceholders(templateBody, {
    name:      student.fullName,
    class:     className,
    stream:    streamName,
    Admission: student.admissionNumber,
    results:   resultsBlock,
  });

  return {
    body,
    recipientLabel: student.fullName,
    phone:          student.parentContact ?? null,
  };
}
