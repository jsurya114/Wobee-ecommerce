import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_TILES, joinPresetList, missingItemsForMinimum, parseBudgetTiles, splitPresetList } from "./app-config";

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

describe("parseBudgetTiles", () => {
  it("reads a stored array in order, normalising a missing cover to null", () => {
    expect(
      parseBudgetTiles([
        { label: "Under ₹299", maxPricePaise: 29_900 },
        { label: " Under ₹599 ", maxPricePaise: 59_900, coverImageUrl: "https://cdn.example.com/b.jpg" },
      ]),
    ).toEqual([
      { label: "Under ₹299", maxPricePaise: 29_900, coverImageUrl: null },
      { label: "Under ₹599", maxPricePaise: 59_900, coverImageUrl: "https://cdn.example.com/b.jpg" },
    ]);
  });

  it("drops malformed entries instead of failing the homepage", () => {
    expect(parseBudgetTiles([{ label: "", maxPricePaise: 100 }, { label: "Ok", maxPricePaise: 12.5 }, null, { label: "Good", maxPricePaise: 100 }])).toEqual([
      { label: "Good", maxPricePaise: 100, coverImageUrl: null },
    ]);
  });

  it("falls back to the original three tiles when nothing valid is stored", () => {
    expect(parseBudgetTiles(null)).toEqual(DEFAULT_BUDGET_TILES);
    expect(parseBudgetTiles([])).toEqual(DEFAULT_BUDGET_TILES);
    expect(parseBudgetTiles("oops")).toEqual(DEFAULT_BUDGET_TILES);
  });
});
