// Composition root for the orders module (ARCHITECTURE.md §3.2) — wires
// repos/services to use-cases to routes, and wires this module's own ports
// to other modules' exported use-cases (cart, pricing, inventory, shipping)
// as trivial pass-through adapters, keeping the dependency-cruiser boundary
// intact. Owns the order state machine (plan.md §4) in its domain layer —
// other modules (payments, returns) trigger transitions by calling this
// module's use-cases through its ports (confirmOrderUseCase,
// markOrderPaymentFailedUseCase, both exported below), never by writing to
// the Order table themselves.
import { getCartUseCase, getOrCreateCartUseCase, markCartConvertedUseCase } from "../cart/cart.module";
import { recordAuditLogUseCase } from "../audit/audit.module";
import { redeemCouponUseCase } from "../coupons/coupons.module";
import { reserveInventoryForCheckoutUseCase, restockFinalizedSaleUseCase } from "../inventory/inventory.module";
import { enqueueNotificationUseCase } from "../notifications/notifications.module";
import { calculateGstUseCase } from "../pricing/pricing.module";
import { createShipmentUseCase, evaluateShippingUseCase } from "../shipping/shipping.module";
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import type { CartReaderPort } from "./application/ports/cart-reader.port";
import type { CartResolverPort } from "./application/ports/cart-resolver.port";
import type { CartWriterPort } from "./application/ports/cart-writer.port";
import type { CouponRedeemerPort } from "./application/ports/coupon-redeemer.port";
import type { GstReaderPort } from "./application/ports/gst-reader.port";
import type { InventoryRestockPort } from "./application/ports/inventory-restock.port";
import type { InventoryReservationPort } from "./application/ports/inventory-reservation.port";
import type { NotificationEnqueuerPort } from "./application/ports/notification-enqueuer.port";
import type { ShipmentCreatorPort } from "./application/ports/shipment-creator.port";
import type { ShippingReaderPort } from "./application/ports/shipping-reader.port";
import { CancelOrderUseCase } from "./application/use-cases/cancel-order.use-case";
import { CheckoutUseCase } from "./application/use-cases/checkout.use-case";
import { ConfirmOrderUseCase } from "./application/use-cases/confirm-order.use-case";
import { DeliverOrderUseCase } from "./application/use-cases/deliver-order.use-case";
import { GetBestSellingVariantQuantitiesUseCase } from "./application/use-cases/get-best-selling-variant-quantities.use-case";
import { GetOrderForAdminUseCase } from "./application/use-cases/get-order-for-admin.use-case";
import { GetOrderForPaymentUseCase } from "./application/use-cases/get-order-for-payment.use-case";
import { GetOrderUseCase } from "./application/use-cases/get-order.use-case";
import { HasPurchasedProductUseCase } from "./application/use-cases/has-purchased-product.use-case";
import { ListMyOrdersUseCase } from "./application/use-cases/list-my-orders.use-case";
import { ListOrdersUseCase } from "./application/use-cases/list-orders.use-case";
import { MarkOrderPaymentFailedUseCase } from "./application/use-cases/mark-order-payment-failed.use-case";
import { NotifyOrderEventUseCase } from "./application/use-cases/notify-order-event.use-case";
import { SetOrderHasActiveReturnUseCase } from "./application/use-cases/set-order-has-active-return.use-case";
import { ShipOrderUseCase } from "./application/use-cases/ship-order.use-case";
import { StartProcessingOrderUseCase } from "./application/use-cases/start-processing-order.use-case";
import { OrderRepository } from "./infrastructure/repositories/order.repository";
import { PrismaTransactionRunner } from "./infrastructure/repositories/transaction.repository";
import { OrderNumberGeneratorService } from "./infrastructure/services/order-number-generator.service";
import { OrdersController } from "./interface/http/orders.controller";
import { createOrdersRouter } from "./interface/http/orders.routes";

const orderRepository = new OrderRepository();
const transactionRunner = new PrismaTransactionRunner();
const orderNumberGenerator = new OrderNumberGeneratorService();

const cartResolver: CartResolverPort = { resolve: (params) => getOrCreateCartUseCase.execute(params) };
const cartReader: CartReaderPort = {
  // Not a trivial pass-through like most cross-module ports here: cart's
  // own CartView surfaces the applied coupon as `appliedCoupon` (with its
  // own live validity/reason for display) rather than a bare code, so this
  // adapter unwraps it to just the code — checkout re-validates it from
  // scratch via couponRedeemer regardless of whatever `isValid` the cart
  // page's own preview last showed (never trusted, per this module's own
  // CheckoutCartView doc comment).
  getCart: async (cartId, userId) => {
    const cart = await getCartUseCase.execute(cartId, userId);
    return { ...cart, couponCode: cart.appliedCoupon?.code ?? null };
  },
};
const cartWriter: CartWriterPort = { markConverted: (cartId, tx) => markCartConvertedUseCase.execute(cartId, tx) };
const couponRedeemer: CouponRedeemerPort = {
  validateAndLock: (input, tx) => redeemCouponUseCase.validateAndLock(input, tx),
  finalize: (couponId, userId, orderId, tx) => redeemCouponUseCase.finalize(couponId, userId, orderId, tx),
};
const shippingReader: ShippingReaderPort = { evaluate: (grams) => evaluateShippingUseCase.execute(grams) };
const shipmentCreator: ShipmentCreatorPort = { createShipment: (input) => createShipmentUseCase.execute(input) };
const gstReader: GstReaderPort = { calculateMany: (lines) => calculateGstUseCase.executeMany(lines) };
const inventoryReservation: InventoryReservationPort = {
  reserveForCheckout: (items, tx) => reserveInventoryForCheckoutUseCase.execute(items, tx),
};
/** Week 2 Day 0 remediation — wired to the restock (not release) operation. See CancelOrderUseCase's own doc comment. */
const inventoryRestock: InventoryRestockPort = { restock: (items, tx) => restockFinalizedSaleUseCase.execute(items, tx) };
const auditLogger: AuditLoggerPort = { log: (entry, tx) => recordAuditLogUseCase.execute(entry, tx) };
const notificationEnqueuer: NotificationEnqueuerPort = { enqueue: (input) => enqueueNotificationUseCase.execute(input) };

const checkoutUseCase = new CheckoutUseCase(
  cartResolver,
  cartReader,
  cartWriter,
  shippingReader,
  gstReader,
  inventoryReservation,
  orderRepository,
  orderNumberGenerator,
  transactionRunner,
  couponRedeemer,
);
/** Exported for `returns`' customer-facing OrderReaderPort adapter (Week 2 Day 6) — keeps the exact same ownership-check semantics GetOrderUseCase's own doc comment describes. */
export const getOrderUseCase = new GetOrderUseCase(orderRepository);
/** Exported for `admin`'s own customer-detail composition (Week 2 Day 7, week2 (1).md §19's "Orders" tab) — same use-case, no ownership gate baked in (that lives at the controller layer via the caller's own req.user.id, or here via admin's own RBAC), so it's safe to reuse for "this customer's orders" too. */
export const listMyOrdersUseCase = new ListMyOrdersUseCase(orderRepository);

/** Exported for cross-module use — payments (Week 1 Day 5) triggers these instead of writing to Order itself. */
export const confirmOrderUseCase = new ConfirmOrderUseCase(orderRepository);
export const markOrderPaymentFailedUseCase = new MarkOrderPaymentFailedUseCase(orderRepository);
export const getOrderForPaymentUseCase = new GetOrderForPaymentUseCase(orderRepository);
/**
 * Exported for `payments`' OrderPort.notifyOrderEvent adapter (Week 2 Day
 * 8) — `payments`' own port deliberately excludes contact PII
 * (GetOrderForPaymentUseCase's own doc comment), so `payments` calls this
 * post-commit with just an orderId + event type; this use-case is what
 * actually re-reads the order (including contactEmail, which `orders` — not
 * `payments` — owns) and builds the notification payload.
 */
export const notifyOrderEventUseCase = new NotifyOrderEventUseCase(orderRepository, notificationEnqueuer);

/** Exported for cross-module use — `admin`'s HTTP layer (ADR-025) calls these directly, same pattern as payments' Day 5 exports above. */
export const startProcessingOrderUseCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const shipOrderUseCase = new ShipOrderUseCase(orderRepository, auditLogger, transactionRunner, shipmentCreator, notifyOrderEventUseCase);
export const deliverOrderUseCase = new DeliverOrderUseCase(orderRepository, auditLogger, transactionRunner, notifyOrderEventUseCase);
/**
 * Status transition + inventory restock ONLY. The refund and the
 * `ORDER_CANCELLED` audit entry that a cancellation also implies are
 * composed one level up, in `admin`'s CancelOrderWithRefundUseCase —
 * `orders` cannot import `refunds` without recreating the
 * orders -> refunds -> payments -> orders import cycle (ADR-025).
 */
export const cancelOrderUseCase = new CancelOrderUseCase(orderRepository, inventoryRestock, transactionRunner);
export const listOrdersUseCase = new ListOrdersUseCase(orderRepository);
export const getOrderForAdminUseCase = new GetOrderForAdminUseCase(orderRepository);
/** Exported for `reviews`' verified-purchase check (Week 2 Day 4). */
export const hasPurchasedProductUseCase = new HasPurchasedProductUseCase(orderRepository);
/** Exported for `returns`' own OrderReturnFlagWriterPort adapter (Week 2 Day 6). */
export const setOrderHasActiveReturnUseCase = new SetOrderHasActiveReturnUseCase(orderRepository);
/** Exported for `home`'s Best Sellers rail (Week 2 Day 8 Part 2, week2 (1).md §12). */
export const getBestSellingVariantQuantitiesUseCase = new GetBestSellingVariantQuantitiesUseCase(orderRepository);

const ordersController = new OrdersController(checkoutUseCase, getOrderUseCase, listMyOrdersUseCase);

export const router = createOrdersRouter(ordersController);
