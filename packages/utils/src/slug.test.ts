import { describe, expect, it } from "vitest";
import { nextSlugCandidate, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates a normal product name", () => {
    expect(slugify("Linen Blend Oversized Shirt")).toBe("linen-blend-oversized-shirt");
  });

  it("collapses repeated/irregular whitespace into single hyphens", () => {
    expect(slugify("  Multiple   Spaces   Here  ")).toBe("multiple-spaces-here");
  });

  it("strips diacritics and punctuation", () => {
    expect(slugify("Café Münster & Co.")).toBe("cafe-munster-co");
  });

  it("trims and collapses hyphens that fall out of punctuation removal", () => {
    expect(slugify("---Already-Slug---")).toBe("already-slug");
  });

  it("returns an empty string for input with no sluggable characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("nextSlugCandidate", () => {
  it("returns the base unchanged on the first attempt", () => {
    expect(nextSlugCandidate("shirt", 1)).toBe("shirt");
  });

  it("appends the attempt number from the second attempt onward", () => {
    expect(nextSlugCandidate("shirt", 2)).toBe("shirt-2");
    expect(nextSlugCandidate("shirt", 5)).toBe("shirt-5");
  });
});
