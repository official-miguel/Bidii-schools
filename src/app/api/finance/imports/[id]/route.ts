/**
 * GET /api/finance/imports/[id] — Poll the status of a FinanceImportJob
 *
 * If the job is still QUEUED, this handler fires processing in the background
 * (fire-and-forget) and returns the current status. The client should poll
 * until status transitions to COMPLETED or FAILED.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { processImportJob } from "@/lib/finance/imports/processor";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const job = await prisma.financeImportJob.findFirst({
    where:  { id: params.id, schoolId },
    select: {
      id:           true,
      status:       true,
      totalRows:    true,
      succeeded:    true,
      failed:       true,
      errorReport:  true,
      importType:   true,
      fileName:     true,
      createdAt:    true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // If still QUEUED, kick off processing as a fire-and-forget so the next
  // poll returns fresh progress. Serverless-safe: the function stays alive
  // for the duration of this request; background work happens asynchronously.
  if (job.status === "QUEUED") {
    processImportJob(job.id).catch(console.error);
  }

  return NextResponse.json({ job });
}
