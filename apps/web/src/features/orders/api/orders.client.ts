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
