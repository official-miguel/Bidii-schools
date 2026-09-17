/**
 * The reminder rules are gated on Kenyan wall-clock time while the servers run
 * in UTC, so an off-by-three-hours bug here would silently send every "7am"
 * reminder at 4am or 10am and nobody would notice from the code alone.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/parentNotifications", () => ({ notifyAllParents: jest.fn() }));

import {
  kenyaHour,
  kenyaDateKey,
  kenyaDayOfWeek,
  kenyaMinutesOfDay,
  kenyaDayRangeUtc,
  formatKenyaDate,
} from "@/lib/notifications/schoolTime";
import {
  parentFacingAudience,
  announcementTitle,
} from "@/lib/notifications/parentCalendar";

describe("Kenyan local time helpers", () => {
  it("maps 04:00 UTC to 07:00 in Kenya — the reminder hour", () => {
    expect(kenyaHour(new Date("2026-09-17T04:00:00.000Z"))).toBe(7);
  });

  it("does not treat 07:00 UTC as the reminder hour", () => {
    expect(kenyaHour(new Date("2026-09-17T07:00:00.000Z"))).toBe(10);
  });

  it("rolls the Kenyan day over at 21:00 UTC, not midnight UTC", () => {
    expect(kenyaDateKey(new Date("2026-09-17T20:59:00.000Z"))).toBe("2026-09-17");
    expect(kenyaDateKey(new Date("2026-09-17T21:00:00.000Z"))).toBe("2026-09-18");
  });

  it("puts the attendance reminder's midday window over Kenyan lunchtime", () => {
    // The regression: the window was evaluated on a UTC server clock, so
    // 12:00-14:00 meant 15:00-17:00 in Nairobi and arrived after school.
    const inWindow = (utc: string) => {
      const h = kenyaHour(new Date(utc));
      return h >= 12 && h < 14;
    };
    expect(inWindow("2026-09-17T09:05:00.000Z")).toBe(true);  // 12:05 Nairobi
    expect(inWindow("2026-09-17T10:55:00.000Z")).toBe(true);  // 13:55 Nairobi
    expect(inWindow("2026-09-17T12:00:00.000Z")).toBe(false); // 15:00 Nairobi
    expect(inWindow("2026-09-17T06:00:00.000Z")).toBe(false); // 09:00 Nairobi
  });

  it("measures minutes-of-day against the Kenyan clock for lesson start times", () => {
    // A lesson stored as "08:00" is 480 minutes into the Kenyan day; the
    // 10-minutes-before check must be true at 07:50 Nairobi = 04:50 UTC.
    expect(480 - kenyaMinutesOfDay(new Date("2026-09-17T04:50:00.000Z"))).toBe(10);
  });

  it("reads the weekday in Kenya, which can differ from the UTC weekday", () => {
    // 22:00 UTC Thursday is already Friday morning in Nairobi.
    expect(kenyaDayOfWeek(new Date("2026-09-17T22:00:00.000Z"))).toBe(5);
    expect(new Date("2026-09-17T22:00:00.000Z").getUTCDay()).toBe(4);
  });

  it("builds today's date range from the Kenyan day, not the UTC day", () => {
    // 22:00 UTC on the 17th is already the 18th in Nairobi.
    const { start, end } = kenyaDayRangeUtc(new Date("2026-09-17T22:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-18T23:59:59.999Z");
  });

  it("formats a midnight-UTC day marker as that same calendar day", () => {
    // Event dates are stored as midnight UTC; +3h must not push them forward.
    // The month abbreviation is locale data ("Sep" vs "Sept"); the day number
    // and weekday are what a +3h shift would break.
    expect(formatKenyaDate(new Date("2026-09-17T00:00:00.000Z"))).toMatch(/^Thu, 17 Sept? 2026$/);
  });
});

describe("lesson reminder delivery guarantee", () => {
  const LEAD_MINUTES = 10; // mirrors lessonReminder.ts

  /** The rule's eligibility test, as implemented. */
  const isDue = (startMinute: number, tickMinute: number) => {
    const minutesUntil = startMinute - tickMinute;
    return minutesUntil >= 1 && minutesUntil <= LEAD_MINUTES;
  };

  /**
   * Does a lesson get delivered, given a set of tick times? The dedupKey means
   * one qualifying tick is enough, so this is "at least one".
   */
  const delivered = (startMinute: number, ticks: number[]) =>
    ticks.some((t) => isDue(startMinute, t));

  const everyStartMinute = Array.from({ length: 24 * 60 }, (_, i) => i);
  const gridTicks = (intervalMin: number) => {
    const ticks: number[] = [];
    for (let t = -60; t < 24 * 60; t += intervalMin) ticks.push(t);
    return ticks;
  };

  it.each([1, 2, 5, 10])(
    "delivers to every lesson start minute on a %i-minute cron",
    (interval) => {
      const ticks = gridTicks(interval);
      const missed = everyStartMinute.filter((s) => !delivered(s, ticks));
      expect(missed).toEqual([]);
    }
  );

  it("survives a cron running at a ragged, jittery cadence", () => {
    // Ticks drifting unpredictably between 1 and 10 minutes apart.
    const ticks: number[] = [];
    let t = -60;
    let seed = 7;
    while (t < 24 * 60) {
      ticks.push(t);
      seed = (seed * 1103515245 + 12345) % 2147483648;
      t += 1 + (seed % 10);
    }
    const missed = everyStartMinute.filter((s) => !delivered(s, ticks));
    expect(missed).toEqual([]);
  });

  it("still delivers when most ticks are dropped entirely", () => {
    // Every other tick on a 5-minute cron simply never runs.
    const ticks = gridTicks(5).filter((_, i) => i % 2 === 0);
    const missed = everyStartMinute.filter((s) => !delivered(s, ticks));
    expect(missed).toEqual([]);
  });

  it("never reminds about a lesson that has already started", () => {
    const start = 8 * 60;
    expect(isDue(start, start)).toBe(false);      // exactly at start
    expect(isDue(start, start + 1)).toBe(false);  // one minute late
    expect(isDue(start, start + 60)).toBe(false); // an hour late
  });

  it("does not remind too far ahead", () => {
    const start = 8 * 60;
    expect(isDue(start, start - LEAD_MINUTES)).toBe(true);
    expect(isDue(start, start - LEAD_MINUTES - 1)).toBe(false);
  });

  it("demonstrates the original narrow window losing lessons outright", () => {
    // The bug this replaced: a 2-minute band on a 5-minute grid was not flaky,
    // it was permanently silent for start times out of phase with the grid.
    const oldIsDue = (s: number, t: number) => s - t >= 9 && s - t <= 10;
    const ticks = gridTicks(5);
    expect(ticks.some((t) => oldIsDue(8 * 60, t))).toBe(true);      // 08:00 fired
    expect(ticks.some((t) => oldIsDue(8 * 60 + 2, t))).toBe(false); // 08:02 never
  });
});

describe("audience filtering", () => {
  it("includes parents for PARENTS_ONLY and EVERYONE, never STAFF_ONLY", () => {
    expect(parentFacingAudience("PARENTS_ONLY")).toBe(true);
    expect(parentFacingAudience("EVERYONE")).toBe(true);
    expect(parentFacingAudience("STAFF_ONLY")).toBe(false);
  });
});

describe("announcementTitle", () => {
  it("prefixes exams and meetings, and leaves plain events alone", () => {
    expect(announcementTitle("EXAM", "End of Term 3")).toBe("Exam: End of Term 3");
    expect(announcementTitle("MEETING", "AGM")).toBe("Meeting: AGM");
    expect(announcementTitle("EVENT", "Sports Day")).toBe("Sports Day");
  });
});
