import { apiFetch } from "@/lib/api-client";

export interface ShippingEstimate {
  serviceable: boolean;
  reason?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
}

/** week2 (1).md §10 — public, no accessToken needed (see shipping.routes.ts's own comment). */
export function getShippingEstimate(pincode: string): Promise<ShippingEstimate> {
  return apiFetch<ShippingEstimate>(`/api/v1/shipping/estimate?pincode=${encodeURIComponent(pincode)}`);
}
