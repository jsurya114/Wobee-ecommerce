import { describe, expect, it } from "vitest";
import type { OfferForResolution } from "./entities/offer.entity";
import { resolveApplicableOffer } from "./resolve-applicable-offer";

function offer(overrides: Partial<OfferForResolution> = {}): OfferForResolution {
  return {
    id: "offer-1",
    name: "Test offer",
    discountType: "PERCENTAGE",
    discountValue: 10,
    scope: "ALL_PRODUCTS",
    categoryId: null,
    productIds: [],
    priority: 0,
    ...overrides,
  };
}

const product = { productId: "product-1", categoryId: "category-1" };

describe("resolveApplicableOffer", () => {
  it("returns null when no candidate targets this product", () => {
    const candidates = [offer({ scope: "PRODUCTS", productIds: ["other-product"] }), offer({ scope: "CATEGORY", categoryId: "other-category" })];
    expect(resolveApplicableOffer(candidates, product, 1000)).toBeNull();
  });

  it("matches ALL_PRODUCTS unconditionally", () => {
    const all = offer({ id: "storewide", scope: "ALL_PRODUCTS" });
    expect(resolveApplicableOffer([all], product, 1000)).toEqual(all);
  });

  it("matches CATEGORY only when categoryId equals the product's own", () => {
    const matching = offer({ id: "cat-match", scope: "CATEGORY", categoryId: "category-1" });
    const nonMatching = offer({ id: "cat-miss", scope: "CATEGORY", categoryId: "some-other-category" });
    expect(resolveApplicableOffer([nonMatching], product, 1000)).toBeNull();
    expect(resolveApplicableOffer([matching], product, 1000)).toEqual(matching);
  });

  it("matches PRODUCTS only when productId is explicitly listed", () => {
    const matching = offer({ id: "prod-match", scope: "PRODUCTS", productIds: ["product-1", "other"] });
    const nonMatching = offer({ id: "prod-miss", scope: "PRODUCTS", productIds: ["other"] });
    expect(resolveApplicableOffer([nonMatching], product, 1000)).toBeNull();
    expect(resolveApplicableOffer([matching], product, 1000)).toEqual(matching);
  });

  it("precedence: a PRODUCTS-scope offer beats a matching CATEGORY-scope offer", () => {
    const productOffer = offer({ id: "product-offer", scope: "PRODUCTS", productIds: ["product-1"], discountValue: 5 });
    const categoryOffer = offer({ id: "category-offer", scope: "CATEGORY", categoryId: "category-1", discountValue: 50 });
    // Deliberately give the CATEGORY offer the bigger discount — specificity must still win over raw discount size.
    expect(resolveApplicableOffer([productOffer, categoryOffer], product, 1000)).toEqual(productOffer);
  });

  it("precedence: a CATEGORY-scope offer beats a matching ALL_PRODUCTS offer", () => {
    const categoryOffer = offer({ id: "category-offer", scope: "CATEGORY", categoryId: "category-1", discountValue: 5 });
    const storewide = offer({ id: "storewide", scope: "ALL_PRODUCTS", discountValue: 50 });
    expect(resolveApplicableOffer([categoryOffer, storewide], product, 1000)).toEqual(categoryOffer);
  });

  it("same scope: higher priority wins regardless of discount size", () => {
    const lowPriorityBigDiscount = offer({ id: "low-priority", scope: "ALL_PRODUCTS", priority: 0, discountValue: 50 });
    const highPrioritySmallDiscount = offer({ id: "high-priority", scope: "ALL_PRODUCTS", priority: 10, discountValue: 5 });
    expect(resolveApplicableOffer([lowPriorityBigDiscount, highPrioritySmallDiscount], product, 1000)).toEqual(highPrioritySmallDiscount);
  });

  it("same scope and priority: the greater discount wins", () => {
    const smaller = offer({ id: "smaller", scope: "ALL_PRODUCTS", priority: 0, discountValue: 10 });
    const bigger = offer({ id: "bigger", scope: "ALL_PRODUCTS", priority: 0, discountValue: 30 });
    expect(resolveApplicableOffer([smaller, bigger], product, 1000)).toEqual(bigger);
  });

  it("identical scope, priority, AND discount: falls back to a deterministic id tie-break", () => {
    const a = offer({ id: "aaa", scope: "ALL_PRODUCTS", priority: 0, discountValue: 10 });
    const z = offer({ id: "zzz", scope: "ALL_PRODUCTS", priority: 0, discountValue: 10 });
    // Order-independent — the same winner regardless of array order.
    expect(resolveApplicableOffer([z, a], product, 1000)).toEqual(a);
    expect(resolveApplicableOffer([a, z], product, 1000)).toEqual(a);
  });
});
