// Composition root for the orders module (ARCHITECTURE.md §3.2) — wires
// repos/services to use-cases to routes, and wires this module's own ports
// to other modules' exported use-cases (cart, pricing, inventory, shipping)
// as trivial pass-through adapters, keeping the dependency-cruiser boundary
// intact. Owns the order state machine (plan.md §4) in its domain layer —
// other modules (payments, returns, Week 1 Day 5+) trigger transitions by
// calling this module's use-cases through its ports, never by writing to
// the Order table themselves.
import { getCartUseCase, getOrCreateCartUseCase, markCartConvertedUseCase } from "../cart/cart.module";
import { reserveInventoryForCheckoutUseCase } from "../inventory/inventory.module";
import { calculateGstUseCase } from "../pricing/pricing.module";
import { evaluateShippingUseCase } from "../shipping/shipping.module";
import type { CartReaderPort } from "./application/ports/cart-reader.port";
import type { CartResolverPort } from "./application/ports/cart-resolver.port";
import type { CartWriterPort } from "./application/ports/cart-writer.port";
import type { GstReaderPort } from "./application/ports/gst-reader.port";
import type { InventoryReservationPort } from "./application/ports/inventory-reservation.port";
import type { ShippingReaderPort } from "./application/ports/shipping-reader.port";
import { CheckoutUseCase } from "./application/use-cases/checkout.use-case";
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

const ordersController = new OrdersController(checkoutUseCase);

export const router = createOrdersRouter(ordersController);
