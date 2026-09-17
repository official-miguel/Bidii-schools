/**
 * Kenyan local time, for notification rules that fire at a wall-clock time.
 *
 * Every time-based rule in this folder means a KENYAN hour — "midday", "7am",
 * "10 minutes before the 08:00 lesson". Servers run in UTC (Vercel always
 * does), so `new Date().getHours()` returns a UTC hour and every one of those
 * rules fires three hours late. That is exactly what happened to the attendance
 * reminder: its 12:00–14:00 check was being evaluated in UTC, which is
 * 15:00–17:00 in Nairobi, long after school.
 *
 * Rules must therefore go through the helpers here rather than reading the
 * clock directly. Setting TZ=Africa/Nairobi on the server would also work, but
 * it silently changes the meaning of every other date call in the codebase and
 * breaks the moment someone deploys without that variable set. An explicit
 * conversion is correct no matter how the process is configured.
 *
 * Kenya is UTC+3 year-round and has never observed daylight saving, so a fixed
 * offset is exact here, not an approximation.
 */

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The instant, shifted so that UTC getters read out Kenyan wall-clock values. */
function asKenyaWallClock(at: Date): Date {
  return new Date(at.getTime() + KENYA_OFFSET_MS);
}

/** The wall-clock hour in Kenya, 0–23. */
export function kenyaHour(at: Date): number {
  return asKenyaWallClock(at).getUTCHours();
}

/** Minutes elapsed since Kenyan midnight — for comparing against "HH:MM". */
export function kenyaMinutesOfDay(at: Date): number {
  const k = asKenyaWallClock(at);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
}

/** Day of week in Kenya, 0 = Sunday, matching Date.getDay(). */
export function kenyaDayOfWeek(at: Date): number {
  return asKenyaWallClock(at).getUTCDay();
}

/** The Kenyan calendar day, as `YYYY-MM-DD`. */
export function kenyaDateKey(at: Date): string {
  return asKenyaWallClock(at).toISOString().slice(0, 10);
}

/**
 * The midnight-UTC day marker for the Kenyan calendar day containing `at`.
 *
 * Date-only columns in this codebase (Attendance.date, CalendarEvent.date) are
 * stored as `new Date("YYYY-MM-DDT00:00:00.000Z")` for the local day the user
 * picked — see parseDateOnly in /api/attendance. So "today's rows" is a range
 * over the midnight-UTC marker of the KENYAN day, not of the UTC day.
 */
export function kenyaDayRangeUtc(at: Date): { start: Date; end: Date } {
  const dateKey = kenyaDateKey(at);
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end:   new Date(`${dateKey}T23:59:59.999Z`),
  };
}

/** Human date for notification copy, e.g. "Tue, 22 Sep 2026". */
export function formatKenyaDate(at: Date): string {
  return asKenyaWallClock(at).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day:     "numeric",
    month:   "short",
    year:    "numeric",
  });
}
