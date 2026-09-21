import { describe, expect, it } from "vitest";
import {
  enumerateDates,
  InvalidDashboardRangeError,
  istDateString,
  istMidnight,
  resolveDashboardPeriod,
  weekStart,
  windowInclusiveEndDate,
} from "./dashboard-period";

// 2026-09-21 18:45 UTC = 2026-09-22 00:15 IST — deliberately just past IST midnight, where UTC and IST disagree about the date.
const NOW = new Date("2026-09-21T18:45:00.000Z");

describe("IST day boundaries", () => {
  it("maps an instant to its IST calendar date", () => {
    expect(istDateString(NOW)).toBe("2026-09-22");
    expect(istDateString(new Date("2026-09-21T18:29:59.999Z"))).toBe("2026-09-21");
    expect(istDateString(new Date("2026-09-21T18:30:00.000Z"))).toBe("2026-09-22");
  });

  it("istMidnight is 18:30 UTC the previous day", () => {
    expect(istMidnight("2026-09-22").toISOString()).toBe("2026-09-21T18:30:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => istMidnight("nope")).toThrow(InvalidDashboardRangeError);
  });
});

describe("resolveDashboardPeriod", () => {
  it("today = the current IST day, half-open, previous = yesterday", () => {
    const p = resolveDashboardPeriod({ range: "today", compare: "previous", now: NOW });
    expect(p.current.start.toISOString()).toBe("2026-09-21T18:30:00.000Z");
    expect(p.current.end.toISOString()).toBe("2026-09-22T18:30:00.000Z");
    expect(p.days).toBe(1);
    expect(p.previous!.start.toISOString()).toBe("2026-09-20T18:30:00.000Z");
    expect(p.previous!.end.toISOString()).toBe(p.current.start.toISOString());
  });

  it.each([
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ] as const)("%s covers exactly %i IST days ending today", (range, days) => {
    const p = resolveDashboardPeriod({ range, compare: "previous", now: NOW });
    expect(p.days).toBe(days);
    expect(windowInclusiveEndDate(p.current)).toBe("2026-09-22");
    expect(enumerateDates(p.current)).toHaveLength(days);
    expect(enumerateDates(p.current).at(-1)).toBe("2026-09-22");
  });

  it("the previous window is the SAME length immediately before, with no gap or overlap", () => {
    const p = resolveDashboardPeriod({ range: "30d", compare: "previous", now: NOW });
    expect(p.previous!.end.getTime()).toBe(p.current.start.getTime());
    expect((p.previous!.end.getTime() - p.previous!.start.getTime()) / 86_400_000).toBe(30);
  });

  it("mtd starts on the 1st of the current IST month; previous is the equal-length window before it", () => {
    const p = resolveDashboardPeriod({ range: "mtd", compare: "previous", now: NOW });
    expect(istDateString(p.current.start)).toBe("2026-09-01");
    expect(p.days).toBe(22);
    expect(istDateString(p.previous!.start)).toBe("2026-08-10");
  });

  it("compare=none yields no previous window", () => {
    expect(resolveDashboardPeriod({ range: "7d", compare: "none", now: NOW }).previous).toBeNull();
  });

  it("buckets daily up to 45 days and weekly beyond", () => {
    expect(resolveDashboardPeriod({ range: "30d", compare: "none", now: NOW }).bucket).toBe("day");
    expect(resolveDashboardPeriod({ range: "90d", compare: "none", now: NOW }).bucket).toBe("week");
  });

  describe("custom", () => {
    it("is inclusive of both dates", () => {
      const p = resolveDashboardPeriod({ range: "custom", from: "2026-09-01", to: "2026-09-10", compare: "previous", now: NOW });
      expect(p.days).toBe(10);
      expect(istDateString(p.current.start)).toBe("2026-09-01");
      expect(windowInclusiveEndDate(p.current)).toBe("2026-09-10");
    });

    it("clamps a future end date to today", () => {
      const p = resolveDashboardPeriod({ range: "custom", from: "2026-09-20", to: "2026-12-31", compare: "none", now: NOW });
      expect(windowInclusiveEndDate(p.current)).toBe("2026-09-22");
    });

    it("rejects: missing bounds, inverted range, future-only range, over a year", () => {
      const now = NOW;
      expect(() => resolveDashboardPeriod({ range: "custom", compare: "none", now })).toThrow(InvalidDashboardRangeError);
      expect(() => resolveDashboardPeriod({ range: "custom", from: "2026-09-10", to: "2026-09-01", compare: "none", now })).toThrow(/before/);
      expect(() => resolveDashboardPeriod({ range: "custom", from: "2027-01-01", to: "2027-01-05", compare: "none", now })).toThrow(/future/);
      expect(() => resolveDashboardPeriod({ range: "custom", from: "2024-01-01", to: "2026-01-01", compare: "none", now })).toThrow(/longer/);
    });
  });
});

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(weekStart("2026-09-22")).toBe("2026-09-21");
  });
});
