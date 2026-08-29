import type { ConfirmCodOrderInput, CreateRazorpayOrderInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface RazorpayCheckoutConfig {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  orderNumber: string;
  keyId: string;
}

/** COD's "no gateway step" (Week 1 Day 5) — confirms the order immediately. */
export function confirmCodOrder(input: ConfirmCodOrderInput, accessToken?: string): Promise<{ alreadyConfirmed: boolean }> {
  return apiFetch("/api/v1/payments/cod/confirm", { method: "POST", body: input, accessToken });
}

/** Creates the Razorpay-side order the client-side Checkout widget needs — does NOT confirm the order (ADR-014: only a webhook-verified capture does that). */
export function createRazorpayOrder(input: CreateRazorpayOrderInput, accessToken?: string): Promise<RazorpayCheckoutConfig> {
  return apiFetch("/api/v1/payments/razorpay/orders", { method: "POST", body: input, accessToken });
}
