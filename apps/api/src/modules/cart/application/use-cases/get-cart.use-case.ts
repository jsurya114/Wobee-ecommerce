import type { PricingMode } from "@woobe/types";
import { computeCartTotals } from "../../domain/compute-cart-totals";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { CouponPreviewPort } from "../ports/coupon-preview.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ShippingProgress, ShippingReaderPort } from "../ports/shipping-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";

export interface CartLineView {
  itemId: string;
  variantId: string;
  productId: string;
  /** Week 2 Day 5 (week2 (1).md §9) — coupon category-applicability matching. */
  categoryId: string;
  /** 2026-08-31 — snapshotted onto the OrderItem at checkout (orders' CheckoutUseCase). */
  pricingMode: PricingMode;
  productSlug: string;
  productName: string;
  image: string | null;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  /** Null for FIXED lines — there is no rate/kg. */
  ratePerKgPaise: number | null;
  unitPricePaise: number;
  quantity: number;
  subtotalPaise: number;
  availableQuantity: number;
  isAvailable: boolean;
}

export interface AppliedCouponView {
  code: string;
  /** false when the applied code no longer validates (expired, cart dropped below its minimum, etc.) — the code stays on the cart so the customer can see why and remove it themselves, rather than it silently vanishing (GetCartUseCase never mutates on read). */
  isValid: boolean;
  reason?: string;
}

export interface CartView {
  cartId: string;
  items: CartLineView[];
  itemCount: number;
  /** Physical weight of every item — real shipping weight, unaffected by pricing mode. */
  totalWeightGrams: number;
  /** 2026-08-31 — weight of WEIGHT_BASED items only; what the "smart cart" threshold banner should key off, not `totalWeightGrams`. */
  weightBasedTotalGrams: number;
  totalPaise: number;
  /** 0 when no coupon is applied or the applied one no longer validates. */
  discountPaise: number;
  appliedCoupon: AppliedCouponView | null;
  /** ADR-021 checkout-blocking + free-delivery progress, always current — never computed client-side. Empty-cart totals (0g) resolve to "below minimum". */
  shipping: ShippingProgress;
}

/**
 * The core of ADR-011: weight, price, and subtotal are recalculated here
 * from LIVE Product/ProductVariant/PricingSetting/Inventory state on every
 * call — never read back from a stored per-line value (there isn't one;
 * CartItem only stores variantId + quantity, see schema.prisma). This is
 * also what makes "tamper with a client-sent price" a no-op: nothing here
 * ever reads a price the client sent. Week 2 Day 5 extends the same rule to
 * coupons — `discountPaise` is always recomputed from the live coupon
 * preview, never read back from a stored value (Cart only stores the code,
 * see Cart.couponCode's own schema comment).
 */
export class GetCartUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly pricingReader: PricingReaderPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly shippingReader: ShippingReaderPort,
    private readonly couponPreview: CouponPreviewPort,
  ) {}

  async execute(cartId: string, userId: string | undefined): Promise<CartView> {
    const [items, couponCode] = await Promise.all([this.cartRepository.findItems(cartId), this.cartRepository.findCouponCode(cartId)]);

    if (items.length === 0) {
      return {
        cartId,
        items: [],
        itemCount: 0,
        totalWeightGrams: 0,
        weightBasedTotalGrams: 0,
        totalPaise: 0,
        discountPaise: 0,
        appliedCoupon: couponCode ? { code: couponCode, isValid: false, reason: "Your bag is empty" } : null,
        shipping: await this.shippingReader.evaluate(0),
      };
    }

    const variantIds = items.map((item) => item.variantId);
    const [variantDetails, availability] = await Promise.all([
      this.variantCatalog.getVariants(variantIds),
      this.inventoryReader.getAvailableQuantities(variantIds),
    ]);

    // A variant no longer resolvable (e.g. hard-deleted) is dropped from the
    // view rather than crashing the whole cart — defensive, shouldn't
    // happen in practice since products are soft-deleted (isActive), not removed.
    const resolvedItems = items
      .map((item) => ({ item, variant: variantDetails.get(item.variantId) }))
      .filter((entry): entry is { item: (typeof items)[number]; variant: NonNullable<typeof entry.variant> } =>
        Boolean(entry.variant),
      );

    const prices = await this.pricingReader.calculateMany(
      resolvedItems.map(({ variant }) => ({
        pricingMode: variant.pricingMode,
        weightGrams: variant.weightGrams,
        ratePerKgOverridePaise: variant.ratePerKgOverridePaise,
        fixedPricePaise: variant.fixedPricePaise,
      })),
    );

    const lines: CartLineView[] = resolvedItems.map(({ item, variant }, i) => {
      const price = prices[i]!;
      const availableQuantity = availability.get(item.variantId) ?? 0;
      return {
        itemId: item.id,
        variantId: item.variantId,
        productId: variant.productId,
        categoryId: variant.categoryId,
        pricingMode: variant.pricingMode,
        productSlug: variant.productSlug,
        productName: variant.productName,
        image: variant.image,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        weightGrams: variant.weightGrams,
        ratePerKgPaise: price.ratePerKgPaise,
        unitPricePaise: price.pricePaise,
        quantity: item.quantity,
        subtotalPaise: price.pricePaise * item.quantity,
        availableQuantity,
        isAvailable: variant.isActive && item.quantity <= availableQuantity,
      };
    });

    const totals = computeCartTotals(
      lines.map((l) => ({ quantity: l.quantity, unitPricePaise: l.unitPricePaise, weightGrams: l.weightGrams, pricingMode: l.pricingMode })),
    );
    const shipping = await this.shippingReader.evaluate(totals.weightBasedTotalGrams);

    let discountPaise = 0;
    let appliedCoupon: AppliedCouponView | null = null;
    if (couponCode) {
      // Coupons require a real account (CouponRedemption.userId is
      // non-null) — a guest with a stored code (e.g. from before logging
      // out) sees it flagged invalid with a clear reason, not silently
      // dropped or a crash.
      if (!userId) {
        appliedCoupon = { code: couponCode, isValid: false, reason: "Log in to use a coupon" };
      } else {
        const preview = await this.couponPreview.preview({
          code: couponCode,
          userId,
          cartSubtotalPaise: totals.totalPaise,
          lines: lines.map((l) => ({ variantId: l.variantId, productId: l.productId, categoryId: l.categoryId, lineTotalPaise: l.subtotalPaise })),
        });
        discountPaise = preview.discountPaise;
        appliedCoupon = { code: couponCode, isValid: preview.ok, reason: preview.reason };
      }
    }

    return { cartId, items: lines, ...totals, discountPaise, appliedCoupon, shipping };
  }
}
