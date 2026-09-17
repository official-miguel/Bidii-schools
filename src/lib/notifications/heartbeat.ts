/**
 * Notification scheduler heartbeat.
 *
 * Every tick stamps a ServiceHealth row. Two things come out of that:
 *
 *  1. A gap detector. When a tick runs and finds the previous stamp is older
 *     than it should be, the scheduler was down in between — so it raises an
 *     IncidentLog entry saying how long for, which the super-admin health page
 *     already renders. Outages that used to pass completely unnoticed become a
 *     visible record with a duration attached.
 *
 *  2. A keep-alive write. Supabase pauses a free-tier project after ~7 days of
 *     inactivity, and a paused database fails every tick. A small write every
 *     few minutes keeps the project active through holidays.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * It cannot tell you the scheduler is down *while* it is down. A heartbeat
 * emitted by the scheduler is only emitted when the scheduler runs, so an
 * outage produces silence, and silence raises nothing. Detection here is
 * always retrospective — you learn about the gap when service returns.
 *
 * Catching an outage in progress requires something OUTSIDE this system
 * watching for the absence of a signal (Healthchecks.io, cron-job.org's
 * failure alerts, or similar). Nothing that lives in this codebase can
 * substitute for that, and this file should not be mistaken for it.
 */

import { prisma } from "@/lib/prisma";
import type { ServiceStatus } from "@prisma/client";

/** Rendered on the super-admin health page; see SERVICE_META there. */
export const SCHEDULER_SERVICE_NAME = "Notification Scheduler";

/**
 * The tick is expected roughly every 5 minutes. Three consecutive misses is
 * the point where a lesson reminder could already have been lost — the lead
 * window is 10 minutes — so that is where "degraded" starts.
 */
const DEGRADED_AFTER_MINUTES = 15;
const OUTAGE_AFTER_MINUTES   = 60;

/** Don't re-raise an incident for a scheduler that is flapping rather than down. */
const INCIDENT_COOLDOWN_MINUTES = 60;

export interface HeartbeatResult {
  /** Minutes since the previous tick. Null on the very first run. */
  gapMinutes: number | null;
  status: ServiceStatus;
  /** True when this tick raised a new outage record. */
  incidentLogged: boolean;
  /** True when this tick closed a previously open outage record. */
  incidentResolved: boolean;
}

/**
 * Stamp the heartbeat and report on the gap. Never throws — the heartbeat is
 * observability, and it must not be capable of breaking the tick it observes.
 */
export async function recordTickHeartbeat(now: Date = new Date()): Promise<HeartbeatResult> {
  const result: HeartbeatResult = {
    gapMinutes: null,
    status: "OPERATIONAL",
    incidentLogged: false,
    incidentResolved: false,
  };

  try {
    const previous = await prisma.serviceHealth.findUnique({
      where:  { serviceName: SCHEDULER_SERVICE_NAME },
      select: { lastCheckedAt: true },
    });

    if (previous) {
      result.gapMinutes = Math.round(
        (now.getTime() - previous.lastCheckedAt.getTime()) / 60_000
      );
    }

    const gap = result.gapMinutes;
    result.status =
      gap === null || gap < DEGRADED_AFTER_MINUTES ? "OPERATIONAL"
      : gap < OUTAGE_AFTER_MINUTES                 ? "DEGRADED"
      : "OUTAGE";

    // ── Raise an incident for a gap, unless one was raised recently ─────────
    if (gap !== null && gap >= DEGRADED_AFTER_MINUTES) {
      const cooldownStart = new Date(now.getTime() - INCIDENT_COOLDOWN_MINUTES * 60_000);
      const recent = await prisma.incidentLog.findFirst({
        where: { serviceName: SCHEDULER_SERVICE_NAME, startedAt: { gte: cooldownStart } },
        select: { id: true },
      });

      if (!recent) {
        await prisma.incidentLog.create({
          data: {
            title:       `Notification scheduler stopped for ${formatGap(gap)}`,
            serviceName: SCHEDULER_SERVICE_NAME,
            // startedAt defaults to now, but the outage began at the last
            // successful tick — record that instead so the duration is real.
            startedAt:   new Date(now.getTime() - gap * 60_000),
            resolvedAt:  now,
            description:
              `No tick ran between ${new Date(now.getTime() - gap * 60_000).toISOString()} ` +
              `and ${now.toISOString()} (${formatGap(gap)}).\n\n` +
              `Lesson reminders are only delivered in the 10 minutes before a lesson, so any ` +
              `lesson starting inside that gap was not reminded and cannot be recovered. ` +
              `Attendance, calendar and fees reminders are retried on later ticks and should ` +
              `catch up on their own.\n\n` +
              `Common causes: the external scheduler stopped calling /api/notifications/tick, ` +
              `CRON_SECRET changed, Vercel deployment protection blocking the request, or the ` +
              `Supabase project being paused.`,
          },
        });
        result.incidentLogged = true;
      }
    }

    // ── Close any open incident once service is back to normal ─────────────
    if (result.status === "OPERATIONAL") {
      const open = await prisma.incidentLog.findFirst({
        where:  { serviceName: SCHEDULER_SERVICE_NAME, resolvedAt: null },
        select: { id: true },
      });
      if (open) {
        await prisma.incidentLog.update({
          where: { id: open.id },
          data:  { resolvedAt: now },
        });
        result.incidentResolved = true;
      }
    }

    // ── Stamp. This write is also what keeps the database from idling. ─────
    await prisma.serviceHealth.upsert({
      where:  { serviceName: SCHEDULER_SERVICE_NAME },
      create: {
        serviceName:    SCHEDULER_SERVICE_NAME,
        status:         result.status,
        lastCheckedAt:  now,
        lastIncidentAt: result.incidentLogged ? now : null,
      },
      update: {
        status:        result.status,
        lastCheckedAt: now,
        ...(result.incidentLogged ? { lastIncidentAt: now } : {}),
      },
    });
  } catch (err) {
    console.error("[heartbeat] failed to record scheduler heartbeat", err);
  }

  return result;
}

/** "18 minutes" / "2 hours 5 minutes" — for incident titles. */
function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest  = minutes % 60;
  const hoursPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0 ? hoursPart : `${hoursPart} ${rest} minute${rest === 1 ? "" : "s"}`;
}
