import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_HIGHLIGHTS, productHighlightsSchema, updateProductSchema } from "./products.schema";

describe("productHighlightsSchema", () => {
  it("accepts and trims ordered label/value pairs", () => {
    const parsed = productHighlightsSchema.parse([
      { label: " Work ", value: " Sequin " },
      { label: "Blouse attached", value: "Yes" },
    ]);
    expect(parsed).toEqual([
      { label: "Work", value: "Sequin" },
      { label: "Blouse attached", value: "Yes" },
    ]);
  });

  it("rejects duplicate labels regardless of case", () => {
    expect(productHighlightsSchema.safeParse([{ label: "Work", value: "A" }, { label: "work", value: "B" }]).success).toBe(false);
  });

  it("rejects empty values, over-long text and too many rows", () => {
    expect(productHighlightsSchema.safeParse([{ label: "Work", value: "  " }]).success).toBe(false);
    expect(productHighlightsSchema.safeParse([{ label: "x".repeat(31), value: "ok" }]).success).toBe(false);
    expect(productHighlightsSchema.safeParse([{ label: "ok", value: "x".repeat(61) }]).success).toBe(false);
    const tooMany = Array.from({ length: MAX_PRODUCT_HIGHLIGHTS + 1 }, (_, i) => ({ label: `L${i}`, value: "v" }));
    expect(productHighlightsSchema.safeParse(tooMany).success).toBe(false);
  });

  it("lets an update clear highlights with [] or leave them untouched by omitting the field", () => {
    expect(updateProductSchema.parse({ highlights: [] }).highlights).toEqual([]);
    expect(updateProductSchema.parse({ name: "X" }).highlights).toBeUndefined();
  });
});
