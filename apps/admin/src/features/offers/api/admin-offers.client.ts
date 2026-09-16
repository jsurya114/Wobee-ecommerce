import { apiFetch } from "@/lib/api-client";

export type OfferDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";
export type OfferScope = "ALL_PRODUCTS" | "CATEGORY" | "PRODUCTS";

export interface AdminOffer {
  id: string;
  name: string;
  description: string | null;
  discountType: OfferDiscountType;
  /** Percent (1-100) for PERCENTAGE, paise for FIXED_AMOUNT — matches the backend's own OfferEntity.discountValue comment. */
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  productIds: string[];
  priority: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfferPayload {
  name?: string;
  description?: string | null;
  discountType?: OfferDiscountType;
  discountValue?: number;
  scope?: OfferScope;
  categoryId?: string | null;
  productIds?: string[];
  priority?: number;
  startsAt?: string;
  endsAt?: string;
}

export function listOffersAdmin(accessToken: string): Promise<{ offers: AdminOffer[] }> {
  return apiFetch("/api/v1/admin/offers", { accessToken });
}

export function getOffer(id: string, accessToken: string): Promise<{ offer: AdminOffer }> {
  return apiFetch(`/api/v1/admin/offers/${id}`, { accessToken });
}

export function createOffer(input: OfferPayload, accessToken: string): Promise<{ offer: AdminOffer }> {
  return apiFetch("/api/v1/admin/offers", { method: "POST", body: input, accessToken });
}

export function updateOffer(id: string, input: Partial<OfferPayload>, accessToken: string): Promise<{ offer: AdminOffer }> {
  return apiFetch(`/api/v1/admin/offers/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setOfferActive(id: string, isActive: boolean, accessToken: string): Promise<{ offer: AdminOffer }> {
  return apiFetch(`/api/v1/admin/offers/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}
