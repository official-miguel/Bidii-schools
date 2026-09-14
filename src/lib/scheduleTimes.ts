/**
 * Maps abstract period numbers (1, 2, 3…) to actual clock times for a
 * given school's TimetableConfig (day start time, period length, break/lunch
 * placement and duration). Every timetable grid in the app schedules in
 * period numbers — this is the one place that converts them to "8:00–8:40"
 * so every screen shows the school's own real format.
 */

export type ScheduleTimesConfig = {
  periodsPerDay: number;
  dayStartTime: string; // "HH:MM", 24-hour
  periodDurationMinutes: number;
  breakAfterPeriod: number | null;
  breakDurationMinutes: number;
  lunchAfterPeriod: number | null;
  lunchDurationMinutes: number;
};

export type PeriodTime = {
  period: number;
  startMinutes: number; // minutes since midnight
  endMinutes: number;
  label: string; // e.g. "8:00–8:40"
};

function parseStartTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 8 * 60; // fall back to 8:00 for anything unparseable
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Returns the start/end clock time for every period 1..periodsPerDay,
 * accounting for a break and/or lunch inserted after specific periods.
 * Used for display only — the scheduling algorithm works in period numbers.
 */
export function computePeriodTimes(config: ScheduleTimesConfig): PeriodTime[] {
  const periods: PeriodTime[] = [];
  let cursor = parseStartTime(config.dayStartTime);

  for (let period = 1; period <= config.periodsPerDay; period++) {
    const start = cursor;
    const end = start + Math.max(1, config.periodDurationMinutes);
    periods.push({
      period,
      startMinutes: start,
      endMinutes: end,
      label: `${formatMinutes(start)}–${formatMinutes(end)}`,
    });
    cursor = end;

    if (config.breakAfterPeriod === period) {
      cursor += Math.max(0, config.breakDurationMinutes);
    }
    if (config.lunchAfterPeriod === period) {
      cursor += Math.max(0, config.lunchDurationMinutes);
    }
  }

  return periods;
}

