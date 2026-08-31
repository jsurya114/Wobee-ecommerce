import { describe, expect, it } from "vitest";
import { isBannerVisible } from "./is-banner-visible";

const NOW = new Date("2026-08-31T12:00:00.000Z");

describe("isBannerVisible", () => {
  it("is not visible when inactive, regardless of schedule", () => {
    expect(isBannerVisible({ isActive: false, startAt: null, endAt: null }, NOW)).toBe(false);
  });

  it("is visible when active with no schedule at all", () => {
    expect(isBannerVisible({ isActive: true, startAt: null, endAt: null }, NOW)).toBe(true);
  });

  it("is not visible before its startAt", () => {
    const startAt = new Date("2026-09-01T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt, endAt: null }, NOW)).toBe(false);
  });

  it("is visible once startAt has passed", () => {
    const startAt = new Date("2026-08-01T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt, endAt: null }, NOW)).toBe(true);
  });

  it("is not visible after its endAt", () => {
    const endAt = new Date("2026-08-01T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt: null, endAt }, NOW)).toBe(false);
  });

  it("is visible before its endAt", () => {
    const endAt = new Date("2026-09-01T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt: null, endAt }, NOW)).toBe(true);
  });

  it("is visible exactly within a start/end window", () => {
    const startAt = new Date("2026-08-01T00:00:00.000Z");
    const endAt = new Date("2026-09-01T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt, endAt }, NOW)).toBe(true);
  });

  it("is not visible outside a start/end window even when active", () => {
    const startAt = new Date("2026-09-01T00:00:00.000Z");
    const endAt = new Date("2026-09-30T00:00:00.000Z");
    expect(isBannerVisible({ isActive: true, startAt, endAt }, NOW)).toBe(false);
  });
});
