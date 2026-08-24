/**
 * GET /api/library/sse/library
 *
 * Server-Sent Events stream for library events.
 * Subscribes to the school-scoped sseBus and forwards events to the browser.
 *
 * Must use Node.js runtime — the Edge runtime does not support EventEmitter.
 */

import { NextRequest } from "next/server";
import { sseBus } from "@/lib/sse";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
  if (!user) return new Response("Unauthorized", { status: 401 });

  const schoolId = user.schoolId!;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const handler = (event: { type: string; payload: unknown; ts: number }) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream already closed — ignore
        }
      };

      sseBus.on(schoolId, handler);

      // Keep-alive comment every 30 seconds to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30_000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        sseBus.off(schoolId, handler);
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
