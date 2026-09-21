import type { DashboardCompare, DashboardRange } from "@woobe/types";

/** IST is UTC+05:30 with no DST — a fixed offset keeps day maths exact and dependency-free. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_CUSTOM_RANGE_DAYS = 366;
/** Beyond this many days the series is bucketed weekly so charts stay legible. */
export const DAILY_BUCKET_MAX_DAYS = 45;

export interface DashboardWindow {
  /** Inclusive instant. */
  start: Date;
  /** Exclusive instant. */
  end: Date;
}

export interface ResolvedDashboardPeriod {
  range: DashboardRange;
  compare: DashboardCompare;
  current: DashboardWindow;
  previous: DashboardWindow | null;
  days: number;
  bucket: "day" | "week";
}

export class InvalidDashboardRangeError extends Error {}

/** `YYYY-MM-DD` of the IST calendar day containing `instant`. */
export function istDateString(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of 00:00 IST on the given `YYYY-MM-DD`. */
export function istMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new InvalidDashboardRangeError(`Invalid date: ${date}`);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Resolves a dashboard selection into concrete half-open windows [start, end)
 * on IST day boundaries, plus the previous EQUIVALENT window (the same number
 * of days immediately before). `custom` needs from/to (inclusive IST dates).
 * Future custom `to` dates are clamped to today.
 */
export function resolveDashboardPeriod(input: {
  range: DashboardRange;
  from?: string;
  to?: string;
  compare: DashboardCompare;
  now: Date;
}): ResolvedDashboardPeriod {
  const today = istDateString(input.now);
  const todayStart = istMidnight(today);
  const tomorrowStart = addDays(todayStart, 1);

  let start: Date;
  let end = tomorrowStart;

  switch (input.range) {
    case "today":
      start = todayStart;
      break;
    case "7d":
      start = addDays(todayStart, -6);
      break;
    case "30d":
      start = addDays(todayStart, -29);
      break;
    case "90d":
      start = addDays(todayStart, -89);
      break;
    case "mtd":
      start = istMidnight(`${today.slice(0, 8)}01`);
      break;
    case "custom": {
      if (!input.from || !input.to) throw new InvalidDashboardRangeError("A custom range needs both from and to.");
      start = istMidnight(input.from);
      const toStart = istMidnight(input.to);
      if (toStart < start) throw new InvalidDashboardRangeError("The end date is before the start date.");
      end = addDays(toStart < todayStart ? toStart : todayStart, 1);
      if (end <= start) throw new InvalidDashboardRangeError("The range starts in the future.");
      break;
    }
  }

  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_CUSTOM_RANGE_DAYS) throw new InvalidDashboardRangeError(`The range is longer than ${MAX_CUSTOM_RANGE_DAYS} days.`);

  const previous: DashboardWindow | null =
    input.compare === "previous" ? { start: addDays(start, -days), end: start } : null;

  return {
    range: input.range,
    compare: input.compare,
    current: { start, end },
    previous,
    days,
    bucket: days <= DAILY_BUCKET_MAX_DAYS ? "day" : "week",
  };
}

/** Inclusive IST end date of a half-open window (what the UI labels as "to"). */
export function windowInclusiveEndDate(window: DashboardWindow): string {
  return istDateString(new Date(window.end.getTime() - 1));
}

/** Every IST calendar date in the window, in order — used to zero-fill series so charts never have gaps. */
export function enumerateDates(window: DashboardWindow): string[] {
  const dates: string[] = [];
  for (let t = window.start.getTime(); t < window.end.getTime(); t += DAY_MS) dates.push(istDateString(new Date(t)));
  return dates;
}

/** Monday (IST) of the week containing the given `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}
