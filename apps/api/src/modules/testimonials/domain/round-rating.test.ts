import { describe, expect, it } from "vitest";
import { roundRating } from "./round-rating";

describe("roundRating", () => {
  it("rounds to one decimal place", () => {
    expect(roundRating(4.777)).toBe(4.8);
    expect(roundRating(4.24)).toBe(4.2);
  });

  it("leaves an already-round number unchanged", () => {
    expect(roundRating(5)).toBe(5);
  });
});
