import type { OfferDiscountType, OfferScope } from "@woobe/types";
import { formatPaiseAsInr } from "@woobe/utils";
import type { OfferPriceFloorTarget, ProductRepositoryPort } from "../../ports/product-repository.port";

export interface OfferDiscountValidationInput {
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  productIds: string[];
}

/**
 * Fix: admin offer discount validation — a FIXED_AMOUNT offer could
 * previously be saved with a discount larger than the price of every
 * product it targets. Nothing ever showed a negative price to a customer
 * (`calculateOfferDiscount`'s own `Math.min(discount, basePrice)` clamp
 * already guaranteed that — see that function's own doc comment), but the
 * admin was never told the discount was nonsensical either; it just
 * silently zeroed out. This is the missing save-time check.
 *
 * Lives here, in `products`, not alongside `validateOfferInput` in
 * `offers` itself: `products` already depends on `offers` (PLP/PDP
 * offer-aware pricing — see `product.repository.ts`'s own
 * `offerLateralJoin` doc comment for the read-path equivalent of this
 * exact rule, applied per-row instead of at save time), and
 * dependency-cruiser's no-circular rule (`.dependency-cruiser.cjs`)
 * forbids the reverse edge — `offers` can't reach into `products` for a
 * price. This is the one side of that one-way relationship that can see
 * both an offer's shape and a product's price, so the check lives here.
 * `CreateOfferWithPriceValidationUseCase` / `UpdateOfferWithPriceValidationUseCase`
 * call this before delegating to `offers`' own create/update use-cases —
 * see their own doc comments for how admin's HTTP layer is wired to go
 * through them instead of the raw offers use-cases.
 *
 * PERCENTAGE never needs this: `validateOfferInput` (offers domain) already
 * bounds it to 1-100, and 100% of any positive price is exactly 0, never
 * negative — no product-price lookup required to know that.
 */
export class ValidateOfferDiscountUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(input: OfferDiscountValidationInput): Promise<string | null> {
    if (input.discountType !== "FIXED_AMOUNT") return null;

    const target = resolveTarget(input);
    // A malformed shape (e.g. CATEGORY scope with no categoryId) has
    // nothing to check a price against here — validateOfferInput (offers
    // module) is what rejects that, with a clearer, shape-specific message.
    if (!target) return null;

    const minPricePaise = await this.productRepository.getMinPricePaiseForOfferTarget(target);
    if (minPricePaise === null || input.discountValue <= minPricePaise) return null;

    return `Discount cannot exceed the price of the cheapest applicable product (${formatPaiseAsInr(minPricePaise)}).`;
  }
}

function resolveTarget(input: OfferDiscountValidationInput): OfferPriceFloorTarget | null {
  if (input.scope === "CATEGORY") return input.categoryId ? { scope: "CATEGORY", categoryId: input.categoryId } : null;
  if (input.scope === "PRODUCTS") return input.productIds.length > 0 ? { scope: "PRODUCTS", productIds: input.productIds } : null;
  return { scope: "ALL_PRODUCTS" };
}
