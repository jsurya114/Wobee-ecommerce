import type { CheckoutInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface OrderItemView {
  id: string;
  variantId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  color: string;
  size: string;
  weightGrams: number;
  /** Null for a FIXED-category line (2026-08-31) — see this order item's `pricingMode` snapshot. */
  unitRatePerKgPaise: number | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  taxAmountPaise: number;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  totalWeightGrams: number;
  paymentMethod: "RAZORPAY" | "COD";
  placedAt: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  /** Week 2 Day 6 (week2 (1).md §11) — the return-window anchor; only a DELIVERED order can be returned. */
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  items: OrderItemView[];
}

/**
 * Guest identity travels via the signed httpOnly cart_id cookie (ADR-011,
 * same as cart's own endpoints) — apiFetch always sends credentials.
 * Server-side inventory reservation + price/tax/shipping snapshot
 * (DEVELOPMENT_RULES.md #1, ADR-015) — nothing computed here is trusted back.
 */
export function checkout(input: CheckoutInput, accessToken?: string): Promise<OrderView> {
  return apiFetch<OrderView>("/api/v1/orders/checkout", { method: "POST", body: input, accessToken });
}
