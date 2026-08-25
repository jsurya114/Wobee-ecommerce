import type { CheckoutAddressInput } from "@woobe/validation";
import { ConflictError, UnprocessableEntityError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import { OrderNumberCollisionError } from "../../domain/errors/order-number-collision.error";
import type { CartReaderPort } from "../ports/cart-reader.port";
import type { CartResolverPort } from "../ports/cart-resolver.port";
import type { CartWriterPort } from "../ports/cart-writer.port";
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
  ) {}

  async execute(input: PlaceOrderInput): Promise<OrderEntity> {
    const { cartId } = await this.cartResolver.resolve({ userId: input.userId, guestCartId: input.guestCartId });
    const cart = await this.cartReader.getCart(cartId);

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
    // NOT the authoritative stock decision. That's the row-locked
    // reservation below; this can still race and lose to it, which is fine
    // (the transaction's reservation failure is the real, always-correct guard).
    const shipping = await this.shippingReader.evaluate(cart.totalWeightGrams);
    if (!shipping.meetsMinimum) {
      throw new UnprocessableEntityError(
        `Add ${shipping.gramsToMinimum}g more to your bag to check out (ADR-021 minimum order weight)`,
      );
    }

    const gstLines = await this.gstReader.calculateMany(
      cart.items.map((line) => ({ unitPricePaise: line.unitPricePaise, lineTotalPaise: line.subtotalPaise })),
    );

    const items: CreateOrderItemInput[] = cart.items.map((line, i) => ({
      variantId: line.variantId,
      productNameSnapshot: line.productName,
      skuSnapshot: line.sku,
      color: line.color,
      size: line.size,
      weightGrams: line.weightGrams,
      unitRatePerKgPaise: line.ratePerKgPaise,
      unitPricePaise: line.unitPricePaise,
      quantity: line.quantity,
      lineTotalPaise: line.subtotalPaise,
      taxAmountPaise: gstLines[i]!.taxAmountPaise,
    }));

    const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
    const taxPaise = items.reduce((sum, item) => sum + item.taxAmountPaise, 0);
    const discountPaise = 0; // coupons deliberately out of scope this week (week1_excecution_prompt.md, Day 4)

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

    return this.transaction.run(async (tx) => {
      const reservation = await this.inventoryReservation.reserveForCheckout(
        cart.items.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        tx,
      );
      if (!reservation.success) {
        // Throwing here rolls back the whole transaction (nothing partially
        // reserved) — see InventoryReservationPort's own comment.
        throw new ConflictError(
          `Stock changed while you were checking out — only ${reservation.insufficient
            .map((line) => line.availableQuantity)
            .join(", ")} left for one or more items. Please review your bag.`,
        );
      }

      const order = await this.createOrderWithRetry(orderBase, tx);
      await this.cartWriter.markConverted(cartId, tx);
      return order;
    });
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
