import { describe, expect, it } from "vitest";
import { createBannerSchema, formatBannerCta, parseBannerCta, type BannerCtaAction } from "./banners.schema";

const ID = "3f2c1b9e-7a4d-4c1e-9b2a-1d2e3f4a5b6c";

describe("banner CTA actions", () => {
  it("round-trips every action through its stored form", () => {
    const actions: BannerCtaAction[] = [
      { type: "CATEGORY", id: ID },
      { type: "COLLECTION", id: ID },
      { type: "PRODUCT", id: ID },
      { type: "OFFERS" },
      { type: "NEW_ARRIVALS" },
      { type: "CUSTOM_URL", url: "/products?size=M" },
      { type: "CUSTOM_URL", url: "https://example.com/sale" },
    ];
    for (const action of actions) {
      expect(parseBannerCta(formatBannerCta(action))).toEqual(action);
    }
    expect(formatBannerCta({ type: "NONE" })).toBeNull();
    expect(parseBannerCta(null)).toEqual({ type: "NONE" });
  });

  it("keeps legacy raw links working", () => {
    expect(parseBannerCta("/products?category=dresses")).toEqual({ type: "CUSTOM_URL", url: "/products?category=dresses" });
  });

  it("rejects unsafe or malformed values", () => {
    for (const bad of ["javascript:alert(1)", "//evil.com", "category:not-a-uuid", "custom:javascript:alert(1)", "custom://evil.com", "data:text/html,x"]) {
      expect(parseBannerCta(bad)).toBeNull();
    }
  });

  it("validates ctaUrl through the same parser at the API boundary", () => {
    const base = { imageUrl: "https://cdn.example.com/b.jpg" };
    expect(createBannerSchema.safeParse({ ...base, ctaUrl: `product:${ID}` }).success).toBe(true);
    expect(createBannerSchema.safeParse({ ...base, ctaUrl: "offers" }).success).toBe(true);
    expect(createBannerSchema.safeParse({ ...base, ctaUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
