import type { CheckoutAddressInput } from "@woobe/validation";
import { ConflictError, UnprocessableEntityError, ValidationError } from "../../../../shared/errors";
import { allocateCouponDiscount } from "../../domain/allocate-coupon-discount";
import type { OrderEntity } from "../../domain/entities/order.entity";
import { isGuestCheckoutEmailConfirmed } from "../../domain/ensure-guest-checkout-email-confirmed";
import { OrderNumberCollisionError } from "../../domain/errors/order-number-collision.error";
import type { CartReaderPort, CheckoutCartLine } from "../ports/cart-reader.port";
import type { CartResolverPort } from "../ports/cart-resolver.port";
import type { CartWriterPort } from "../ports/cart-writer.port";
import type { CouponRedeemerPort } from "../ports/coupon-redeemer.port";
import type { GstReaderPort } from "../ports/gst-reader.port";
import type { InventoryReservationPort } from "../ports/inventory-reservation.port";
import type { CreateOrderInput, CreateOrderItemInput, OrderRepositoryPort } from "../ports/order-repository.port";
import type { OrderNumberGeneratorPort } from "../ports/order-number-generator.port";
import type { ShippingReaderPort } from "../ports/shipping-reader.port";
import type { TransactionPort } from "../ports/transaction.port";

export interface PlaceOrderInput {
  userId?: string;
  guestCartId?: string;
  contactEmail: string;
  /** Client-review fix (2026-09-03) — required (and checked) only for a guest checkout; see isGuestCheckoutEmailConfirmed. */
  confirmEmail?: string;
  address: CheckoutAddressInput;
  paymentMethod: OrderEntity["paymentMethod"];
}

const MAX_ORDER_NUMBER_ATTEMPTS = 3;

/**
 * Checkout (ADR-015, plan.md §6) — the one place that turns a cart into an
 * order. Reads the cart through the exact same live weight/price/stock path
 * the cart page renders (never trusts a client-sent total,
 * DEVELOPMENT_RULES.md #1), then reserves inventory and creates the order
 * inside a single Unit-of-Work transaction so "stock reserved" and "order
 * exists" can never disagree (see TransactionPort).
 *
 * Week 2 Day 5 (week2 (1).md §9) adds live coupon redemption. GST, item
 * building, and the subtotal/tax/discount totals all moved INSIDE the
 * transaction (they weren't before) because the discount amount — needed
 * before tax can be recalculated on the discounted value, per §9's own
 * "Calculate discount -> Recalculate tax" ordering — only becomes known
 * once the coupon's row lock is held (`couponRedeemer.validateAndLock`,
 * see that port's own doc comment for why this is a two-phase call split
 * around order creation). Re-doing this work inside `tx` on every retry of
 * `createOrderWithRetry` is intentional, not an oversight: an order-number
 * collision is astronomically rare, and re-deriving from live state again
 * is simpler and safer than trying to cache it across a retry.
 */
export class CheckoutUseCase {
  constructor(
    private readonly cartResolver: CartResolverPort,
    private readonly cartReader: CartReaderPort,
    private readonly cartWriter: CartWriterPort,
    private readonly shippingReader: ShippingReaderPort,
    private readonly gstReader: GstReaderPort,
    private readonly inventoryReservation: InventoryReservationPort,
    private readonly orderRepository: OrderRepositoryPort,
    private readonly orderNumberGenerator: OrderNumberGeneratorPort,
    private readonly transaction: TransactionPort,
    private readonly couponRedeemer: CouponRedeemerPort,
  ) {}

  async execute(input: PlaceOrderInput): Promise<OrderEntity> {
    // Client-review fix (2026-09-03) — checked first, before touching the
    // cart at all: a guest's contactEmail is the only thread back to their
    // account (see ClaimGuestOrderUseCase), so a typo here is unrecoverable
    // in a way nothing else about checkout is. Cheap, fail-fast.
    if (
      !isGuestCheckoutEmailConfirmed({
        isGuest: !input.userId,
        contactEmail: input.contactEmail,
        confirmEmail: input.confirmEmail,
      })
    ) {
      throw new ValidationError("Please confirm your email address", { confirmEmail: ["Emails do not match"] });
    }

    const { cartId } = await this.cartResolver.resolve({ userId: input.userId, guestCartId: input.guestCartId });
    const cart = await this.cartReader.getCart(cartId, input.userId);

    if (cart.items.length === 0) {
      throw new UnprocessableEntityError("Your bag is empty");
    }

    const unavailable = cart.items.filter((line) => !line.isAvailable);
    if (unavailable.length > 0) {
      throw new ConflictError(
        `Some items in your bag are no longer available: ${unavailable.map((line) => line.productName).join(", ")}`,
      );
    }

    // Pre-transaction check for a fast, friendly error on the common case —
    // NOT the authoritative stock/fee decision. That's the row-locked
    // reservation below plus the in-transaction shipping re-read; this can
    // still race and lose to them, which is fine (the transaction's own
    // checks are the real, always-correct guards).
    const preCheckShipping = await this.shippingReader.evaluate(cart.weightBasedTotalGrams);
    if (!preCheckShipping.meetsMinimum) {
      throw new UnprocessableEntityError(
        `Add ${preCheckShipping.gramsToMinimum}g more to your bag to check out (ADR-021 minimum order weight)`,
      );
    }

    // Coupons require a real account (CouponRedemption.userId is non-null,
    // and cart/coupon POST is authGuard-only — see cart.routes.ts) — a
    // couponCode surviving onto a guest checkout shouldn't happen in
    // practice, but is treated as "no coupon" rather than crashing checkout
    // over it.
    const couponCode = input.userId ? cart.couponCode : null;

    return this.transaction.run(async (tx) => {
      const couponResult = couponCode
        ? await this.couponRedeemer.validateAndLock(
            {
              code: couponCode,
              userId: input.userId!,
              cartSubtotalPaise: cart.totalPaise,
              lines: cart.items.map((line) => ({
                variantId: line.variantId,
                productId: line.productId,
                categoryId: line.categoryId,
                lineTotalPaise: line.subtotalPaise,
              })),
            },
            tx,
          )
        : null;

      const discountPaise = couponResult?.discountPaise ?? 0;
      const lineDiscounts = couponResult ? allocateCouponDiscount(discountPaise, couponResult.eligibleLines) : new Map<string, number>();

      // Week 2 review fix (P1) — re-evaluate the shipping fee INSIDE the
      // transaction, exactly like GST is (recomputed in buildOrderItems, also
      // inside `tx`). The pre-transaction call above is only a fast-fail on the
      // minimum-weight rule; using its fee here would let an admin editing
      // ShippingRule mid-checkout commit an order against a stale fee. §9's own
      // flow is "Calculate discount -> Recalculate tax/shipping -> Final total".
      const shipping = await this.shippingReader.evaluate(cart.weightBasedTotalGrams);

      const items = await this.buildOrderItems(cart.items, lineDiscounts);
      const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
      const taxPaise = items.reduce((sum, item) => sum + item.taxAmountPaise, 0);

      const orderBase: Omit<CreateOrderInput, "orderNumber"> = {
        userId: input.userId ?? null,
        contactName: input.address.fullName,
        contactPhone: input.address.phone,
        contactEmail: input.contactEmail,
        shippingSnapshot: toShippingSnapshot(input.address),
        subtotalPaise,
        discountPaise,
        shippingFeePaise: shipping.shippingFeePaise,
        taxPaise,
        totalPaise: subtotalPaise + taxPaise + shipping.shippingFeePaise - discountPaise,
        totalWeightGrams: cart.totalWeightGrams,
        paymentMethod: input.paymentMethod,
        items,
      };

      const reservation = await this.inventoryReservation.reserveForCheckout(
        cart.items.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        tx,
      );
      if (!reservation.success) {
        // Throwing here rolls back the whole transaction (nothing partially
        // reserved, and — when a coupon was applied — the lock acquired by
        // validateAndLock above releases with no redemption ever recorded).
        throw new ConflictError(
          `Stock changed while you were checking out — only ${reservation.insufficient
            .map((line) => line.availableQuantity)
            .join(", ")} left for one or more items. Please review your bag.`,
        );
      }

      const order = await this.createOrderWithRetry(orderBase, tx);

      if (couponResult) {
        // Same transaction, same still-held row lock (Postgres holds a lock
        // for the whole transaction, not just the statement that took it) —
        // see CouponRedeemerPort's own doc comment for why this is a
        // separate call rather than folded into validateAndLock.
        await this.couponRedeemer.finalize(couponResult.couponId, input.userId!, order.id, tx);
      }

      await this.cartWriter.markConverted(cartId, tx);
      return order;
    });
  }

  private async buildOrderItems(lines: CheckoutCartLine[], lineDiscounts: Map<string, number>): Promise<CreateOrderItemInput[]> {
    const gstLines = await this.gstReader.calculateMany(
      lines.map((line) => ({
        unitPricePaise: line.unitPricePaise,
        // Tax is calculated on the discounted line value (§9's "Calculate
        // discount -> Recalculate tax" ordering) — the slab itself is still
        // picked from the undiscounted per-unit price (GstSlab's own
        // comment: tiered by *per-piece* price, which a promotional
        // discount doesn't change).
        lineTotalPaise: line.subtotalPaise - (lineDiscounts.get(line.variantId) ?? 0),
      })),
    );

    return lines.map((line, i) => ({
      variantId: line.variantId,
      productNameSnapshot: line.productName,
      skuSnapshot: line.sku,
      color: line.color,
      size: line.size,
      weightGrams: line.weightGrams,
      pricingMode: line.pricingMode,
      unitRatePerKgPaise: line.ratePerKgPaise,
      unitPricePaise: line.unitPricePaise,
      quantity: line.quantity,
      lineTotalPaise: line.subtotalPaise,
      taxAmountPaise: gstLines[i]!.taxAmountPaise,
      // Week 2 review fix (P0) — snapshot the coupon discount allocated to this
      // line (already computed above for the GST recompute, previously discarded).
      // returns/refunds subtract it so a refund never exceeds what was paid.
      discountPaise: lineDiscounts.get(line.variantId) ?? 0,
    }));
  }

  private async createOrderWithRetry(
    base: Omit<CreateOrderInput, "orderNumber">,
    tx: unknown,
    attempt = 0,
  ): Promise<OrderEntity> {
    const orderNumber = this.orderNumberGenerator.generate();
    try {
      return await this.orderRepository.createWithItems({ ...base, orderNumber }, tx);
    } catch (error) {
      if (error instanceof OrderNumberCollisionError && attempt < MAX_ORDER_NUMBER_ATTEMPTS - 1) {
        return this.createOrderWithRetry(base, tx, attempt + 1);
      }
      throw error;
    }
  }
}

function toShippingSnapshot(address: CheckoutAddressInput): OrderEntity["shippingSnapshot"] {
  return {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    ...(address.line2 ? { line2: address.line2 } : {}),
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  };
}
