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
import { releaseReservationUseCase, reserveInventoryForCheckoutUseCase } from "../inventory/inventory.module";
import { calculateGstUseCase } from "../pricing/pricing.module";
import { evaluateShippingUseCase } from "../shipping/shipping.module";
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import type { CartReaderPort } from "./application/ports/cart-reader.port";
import type { CartResolverPort } from "./application/ports/cart-resolver.port";
import type { CartWriterPort } from "./application/ports/cart-writer.port";
import type { GstReaderPort } from "./application/ports/gst-reader.port";
import type { InventoryReleasePort } from "./application/ports/inventory-release.port";
import type { InventoryReservationPort } from "./application/ports/inventory-reservation.port";
import type { ShippingReaderPort } from "./application/ports/shipping-reader.port";
import { CancelOrderUseCase } from "./application/use-cases/cancel-order.use-case";
import { CheckoutUseCase } from "./application/use-cases/checkout.use-case";
import { ConfirmOrderUseCase } from "./application/use-cases/confirm-order.use-case";
import { DeliverOrderUseCase } from "./application/use-cases/deliver-order.use-case";
import { GetOrderForAdminUseCase } from "./application/use-cases/get-order-for-admin.use-case";
import { GetOrderForPaymentUseCase } from "./application/use-cases/get-order-for-payment.use-case";
import { GetOrderUseCase } from "./application/use-cases/get-order.use-case";
import { ListMyOrdersUseCase } from "./application/use-cases/list-my-orders.use-case";
import { ListOrdersUseCase } from "./application/use-cases/list-orders.use-case";
import { MarkOrderPaymentFailedUseCase } from "./application/use-cases/mark-order-payment-failed.use-case";
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
const cartReader: CartReaderPort = { getCart: (cartId) => getCartUseCase.execute(cartId) };
const cartWriter: CartWriterPort = { markConverted: (cartId, tx) => markCartConvertedUseCase.execute(cartId, tx) };
const shippingReader: ShippingReaderPort = { evaluate: (grams) => evaluateShippingUseCase.execute(grams) };
const gstReader: GstReaderPort = { calculateMany: (lines) => calculateGstUseCase.executeMany(lines) };
const inventoryReservation: InventoryReservationPort = {
  reserveForCheckout: (items, tx) => reserveInventoryForCheckoutUseCase.execute(items, tx),
};
const inventoryRelease: InventoryReleasePort = { release: (items, tx) => releaseReservationUseCase.execute(items, tx) };
const auditLogger: AuditLoggerPort = { log: (entry, tx) => recordAuditLogUseCase.execute(entry, tx) };

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
);
const getOrderUseCase = new GetOrderUseCase(orderRepository);
const listMyOrdersUseCase = new ListMyOrdersUseCase(orderRepository);

/** Exported for cross-module use — payments (Week 1 Day 5) triggers these instead of writing to Order itself. */
export const confirmOrderUseCase = new ConfirmOrderUseCase(orderRepository);
export const markOrderPaymentFailedUseCase = new MarkOrderPaymentFailedUseCase(orderRepository);
export const getOrderForPaymentUseCase = new GetOrderForPaymentUseCase(orderRepository);

/** Exported for cross-module use — `admin`'s HTTP layer (ADR-025) calls these directly, same pattern as payments' Day 5 exports above. */
export const startProcessingOrderUseCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const shipOrderUseCase = new ShipOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const deliverOrderUseCase = new DeliverOrderUseCase(orderRepository, auditLogger, transactionRunner);
/**
 * Status transition + inventory release ONLY. The refund and the
 * `ORDER_CANCELLED` audit entry that a cancellation also implies are
 * composed one level up, in `admin`'s CancelOrderWithRefundUseCase —
 * `orders` cannot import `refunds` without recreating the
 * orders -> refunds -> payments -> orders import cycle (ADR-025).
 */
export const cancelOrderUseCase = new CancelOrderUseCase(orderRepository, inventoryRelease, transactionRunner);
export const listOrdersUseCase = new ListOrdersUseCase(orderRepository);
export const getOrderForAdminUseCase = new GetOrderForAdminUseCase(orderRepository);

const ordersController = new OrdersController(checkoutUseCase, getOrderUseCase, listMyOrdersUseCase);

export const router = createOrdersRouter(ordersController);
