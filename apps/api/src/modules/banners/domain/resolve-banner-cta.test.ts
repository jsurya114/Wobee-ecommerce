import { describe, expect, it } from "vitest";
import { resolveBannerCtaHref, type BannerLinkTargets } from "./resolve-banner-cta";

const targets: BannerLinkTargets = {
  categories: new Map([["cat-1", "dresses"]]),
  collections: new Map([["col-1", "new-drops"]]),
  products: new Map([["prod-1", "silk-scarf"]]),
};

describe("resolveBannerCtaHref", () => {
  it("resolves internal targets to relative storefront paths by their CURRENT slug", () => {
    expect(resolveBannerCtaHref({ type: "CATEGORY", id: "cat-1" }, targets)).toBe("/products?category=dresses");
    expect(resolveBannerCtaHref({ type: "COLLECTION", id: "col-1" }, targets)).toBe("/collections/new-drops");
    expect(resolveBannerCtaHref({ type: "PRODUCT", id: "prod-1" }, targets)).toBe("/products/silk-scarf");
    expect(resolveBannerCtaHref({ type: "OFFERS" }, targets)).toBe("/products?onOffer=true");
    expect(resolveBannerCtaHref({ type: "NEW_ARRIVALS" }, targets)).toBe("/products?sort=newest");
  });

  it("hides the link (null) when the target is gone or inactive", () => {
    expect(resolveBannerCtaHref({ type: "PRODUCT", id: "missing" }, targets)).toBeNull();
    expect(resolveBannerCtaHref({ type: "CATEGORY", id: "missing" }, targets)).toBeNull();
  });

  it("passes custom/legacy links through, and NONE/unparseable resolve to no link", () => {
    expect(resolveBannerCtaHref({ type: "CUSTOM_URL", url: "/products?size=M" }, targets)).toBe("/products?size=M");
    expect(resolveBannerCtaHref({ type: "NONE" }, targets)).toBeNull();
    expect(resolveBannerCtaHref(null, targets)).toBeNull();
  });
});
