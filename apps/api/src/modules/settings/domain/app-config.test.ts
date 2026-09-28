import { describe, expect, it } from "vitest";
import { joinPresetList, missingItemsForMinimum, splitPresetList } from "./app-config";

describe("preset lists", () => {
  it("round-trips through the stored comma-separated form", () => {
    expect(splitPresetList(joinPresetList(["S", "M", "Free Size"]))).toEqual(["S", "M", "Free Size"]);
  });

  it("drops blanks and trims whitespace from stored values", () => {
    expect(splitPresetList(" S, ,M ,")).toEqual(["S", "M"]);
  });
});

describe("missingItemsForMinimum", () => {
  it("is 0 once the bag meets the minimum", () => {
    expect(missingItemsForMinimum(3, 3)).toBe(0);
    expect(missingItemsForMinimum(5, 3)).toBe(0);
  });

  it("reports how many more items are needed", () => {
    expect(missingItemsForMinimum(1, 3)).toBe(2);
  });
});
