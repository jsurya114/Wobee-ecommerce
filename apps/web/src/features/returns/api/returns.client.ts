import { apiFetch } from "@/lib/api-client";

export interface ReturnSummary {
  id: string;
  orderId: string;
  orderNumber: string;
  status: "RETURN_REQUESTED" | "RETURN_APPROVED" | "RETURN_REJECTED" | "REFUND_INITIATED" | "REFUNDED";
  reason: string;
  requestedAt: string;
  resolvedAt: string | null;
  itemCount: number;
}

export interface RequestReturnInput {
  orderId: string;
  reason: string;
  items: { orderItemId: string; quantity: number; reasonDetail?: string }[];
}

/** Returns require a real account — same reasoning as coupons, Week 2 Day 5 (Cart.couponCode's own schema comment). */
export function requestReturn(input: RequestReturnInput, accessToken: string): Promise<ReturnSummary> {
  return apiFetch<ReturnSummary>("/api/v1/returns", { method: "POST", body: input, accessToken });
}

/** `orderId` narrows to one order's own returns — avoids fetching the caller's entire return history to render a single order's page. */
export function listMyReturns(accessToken: string, orderId?: string): Promise<{ returns: ReturnSummary[] }> {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  return apiFetch<{ returns: ReturnSummary[] }>(`/api/v1/returns${query}`, { accessToken });
}
