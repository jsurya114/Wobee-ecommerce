import type { OrderView } from "@/features/checkout/api/checkout.client";

/**
 * Does this order take a payment through Razorpay before it's confirmed?
 * A RAZORPAY order pays its total; a COD order pays only its delivery fee
 * when checkout recorded a cash-on-delivery balance for it (COD shipping
 * upfront, 2026-09-28 — `payableOnDeliveryPaise` is only ever set on such
 * COD orders). Mirrors the server's own rule; the server enforces it.
 */
export function requiresOnlinePayment(order: Pick<OrderView, "paymentMethod" | "payableOnDeliveryPaise">): boolean {
  return order.paymentMethod === "RAZORPAY" || (order.paymentMethod === "COD" && order.payableOnDeliveryPaise !== null);
}

/** The COD delivery-fee split, or null for an order without one. */
export function codUpfrontSplit(
  order: Pick<OrderView, "paymentMethod" | "payableOnDeliveryPaise" | "shippingFeePaise">,
): { deliveryFeePaise: number; payableOnDeliveryPaise: number } | null {
  if (order.paymentMethod !== "COD" || order.payableOnDeliveryPaise === null) return null;
  return { deliveryFeePaise: order.shippingFeePaise, payableOnDeliveryPaise: order.payableOnDeliveryPaise };
}
