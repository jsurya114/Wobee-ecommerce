import { describe, expect, it } from "vitest";
import { hasAttributes, parseSearchQuery, toMatchTerms } from "./parse-search-query";

describe("parseSearchQuery", () => {
  it("pulls colour, fit and size out of a natural-language query, leaving the product word", () => {
    expect(parseSearchQuery("rose color kurti relaxed fit small size")).toEqual({
      keywords: "kurti",
      colors: ["rose"],
      sizes: ["S"],
      fabrics: [],
      fits: ["relaxed"],
    });
  });

  it("drops filler words like 'with'", () => {
    expect(parseSearchQuery("rose color kurti with relaxed fit small size")).toEqual({
      keywords: "kurti",
      colors: ["rose"],
      sizes: ["S"],
      fabrics: [],
      fits: ["relaxed"],
    });
  });

  it("extracts a fabric", () => {
    expect(parseSearchQuery("cotton saree")).toEqual({ keywords: "saree", colors: [], sizes: [], fabrics: ["cotton"], fits: [] });
  });

  it("keeps hyphenated words whole and reads an upper-case size", () => {
    expect(parseSearchQuery("XL black t-shirt")).toEqual({ keywords: "t-shirt", colors: ["black"], sizes: ["XL"], fabrics: [], fits: [] });
  });

  it("returns the query unchanged as keywords when it names no attribute", () => {
    expect(parseSearchQuery("kurti")).toEqual({ keywords: "kurti", colors: [], sizes: [], fabrics: [], fits: [] });
  });

  it("returns all-empty for an empty or blank query", () => {
    const empty = { keywords: "", colors: [], sizes: [], fabrics: [], fits: [] };
    expect(parseSearchQuery("")).toEqual(empty);
    expect(parseSearchQuery("   ")).toEqual(empty);
  });

  it("collects several sizes in the order they were typed", () => {
    expect(parseSearchQuery("small medium")).toEqual({ keywords: "", colors: [], sizes: ["S", "M"], fabrics: [], fits: [] });
  });

  it("matches multi-word values before single words", () => {
    expect(parseSearchQuery("extra large dress").sizes).toEqual(["XL"]);
    expect(parseSearchQuery("free size dupatta")).toEqual({ keywords: "dupatta", colors: [], sizes: ["Free Size"], fabrics: [], fits: [] });
    expect(parseSearchQuery("dusty rose top").colors).toEqual(["dusty rose"]);
  });

  it("keeps a-line as a fit rather than treating 'a' as filler", () => {
    expect(parseSearchQuery("a-line kurti")).toEqual({ keywords: "kurti", colors: [], sizes: [], fabrics: [], fits: ["a-line"] });
  });

  it("does not repeat a value typed twice, and ignores punctuation", () => {
    expect(parseSearchQuery("red, red dress!")).toEqual({ keywords: "dress", colors: ["red"], sizes: [], fabrics: [], fits: [] });
  });

  it("recognises the admin's own presets on top of the dictionary", () => {
    expect(parseSearchQuery("mulmul kurti", { fabrics: ["Mulmul"] })).toEqual({ keywords: "kurti", colors: [], sizes: [], fabrics: ["mulmul"], fits: [] });
    expect(parseSearchQuery("kurti", { fabrics: ["Mulmul"] }).fabrics).toEqual([]);
  });
});

describe("toMatchTerms", () => {
  it("splits keywords into name words and expands colour and size synonyms", () => {
    expect(toMatchTerms(parseSearchQuery("gray cotton kurti set free size"))).toEqual({
      nameTerms: ["kurti", "set"],
      colorTerms: ["grey", "gray"],
      sizeValues: ["Free Size", "One Size"],
      fabricTerms: ["cotton"],
      fitTerms: [],
    });
  });
});

describe("hasAttributes", () => {
  it("is false for a plain product-word query and true once an attribute is named", () => {
    expect(hasAttributes(parseSearchQuery("kurti"))).toBe(false);
    expect(hasAttributes(parseSearchQuery("black kurti"))).toBe(true);
  });
});
