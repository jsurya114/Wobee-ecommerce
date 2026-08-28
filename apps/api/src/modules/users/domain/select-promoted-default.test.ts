import { describe, expect, it } from "vitest";
import { selectPromotedDefault } from "./select-promoted-default";

describe("selectPromotedDefault", () => {
  it("returns null when no addresses remain", () => {
    expect(selectPromotedDefault([])).toBeNull();
  });

  it("promotes the single remaining address", () => {
    const only = { id: "a1", createdAt: new Date("2026-01-01") };
    expect(selectPromotedDefault([only])).toBe("a1");
  });

  it("promotes the oldest of several remaining addresses, regardless of array order", () => {
    const oldest = { id: "a1", createdAt: new Date("2026-01-01") };
    const middle = { id: "a2", createdAt: new Date("2026-02-01") };
    const newest = { id: "a3", createdAt: new Date("2026-03-01") };
    expect(selectPromotedDefault([newest, oldest, middle])).toBe("a1");
    expect(selectPromotedDefault([oldest, middle, newest])).toBe("a1");
  });
});
