import type { ClaimGuestOrderInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";
import type { OrderView } from "@/features/checkout/api/checkout.client";

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "RAZORPAY" | "COD";
  totalPaise: number;
  itemCount: number;
  placedAt: string;
}

/** Guest orders are readable by id alone; account orders require ownership — see GetOrderUseCase's own comment on the API side. */
export function getOrder(orderId: string, accessToken?: string): Promise<OrderView> {
  return apiFetch<OrderView>(`/api/v1/orders/${encodeURIComponent(orderId)}`, { accessToken });
}

/** "My Orders" — logged-in only. */
export function listMyOrders(accessToken: string): Promise<{ orders: OrderSummary[] }> {
  return apiFetch<{ orders: OrderSummary[] }>("/api/v1/orders", { accessToken });
}

/**
 * "Add a guest order" (client-review fix, 2026-09-03) — attaches a guest
 * order to the caller's own account by proving they hold both the order
 * number (from the confirmation page/email) and the exact email it was
 * placed under. Covers checking out as a guest under one email and later
 * registering/logging in under a different one, not just a matching one.
 */
export function claimGuestOrder(input: ClaimGuestOrderInput, accessToken: string): Promise<OrderView> {
  return apiFetch<OrderView>("/api/v1/orders/claim-guest-order", { method: "POST", body: input, accessToken });
}
