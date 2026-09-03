import { apiFetch } from "@/lib/api-client";

export type CouponType = "PERCENTAGE" | "FLAT";

export interface AdminCoupon {
  id: string;
  code: string;
  type: CouponType;
  /** Percent (1-100) for PERCENTAGE, paise for FLAT — matches the backend's own CouponEntity.value comment. */
  value: number;
  minCartValuePaise: number | null;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  redemptionCount: number;
}

export interface CouponPayload {
  code?: string;
  type?: CouponType;
  value?: number;
  minCartValuePaise?: number | null;
  maxDiscountPaise?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  validFrom?: string;
  validTo?: string;
}

export function listCouponsAdmin(accessToken: string): Promise<{ coupons: AdminCoupon[] }> {
  return apiFetch("/api/v1/admin/coupons", { accessToken });
}

export function getCoupon(id: string, accessToken: string): Promise<{ coupon: AdminCoupon }> {
  return apiFetch(`/api/v1/admin/coupons/${id}`, { accessToken });
}

export function createCoupon(input: CouponPayload, accessToken: string): Promise<{ coupon: AdminCoupon }> {
  return apiFetch("/api/v1/admin/coupons", { method: "POST", body: input, accessToken });
}

export function updateCoupon(id: string, input: Partial<CouponPayload>, accessToken: string): Promise<{ coupon: AdminCoupon }> {
  return apiFetch(`/api/v1/admin/coupons/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setCouponActive(id: string, isActive: boolean, accessToken: string): Promise<{ coupon: AdminCoupon }> {
  return apiFetch(`/api/v1/admin/coupons/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function deleteCoupon(id: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/coupons/${id}`, { method: "DELETE", accessToken });
}
