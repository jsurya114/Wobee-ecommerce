import type { OrderStatus, PaymentMethod } from "@woobe/types";
import type { CancelOrderInput, ShipOrderInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AdminOrderItemView {
  id: string;
  variantId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  color: string;
  size: string;
  weightGrams: number;
  /** Null for a FIXED-category line (2026-08-31). */
  unitRatePerKgPaise: number | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  taxAmountPaise: number;
}

export interface AdminOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingSnapshot: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  totalWeightGrams: number;
  paymentMethod: PaymentMethod;
  placedAt: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** True while a non-terminal Return exists against this order (Week 2 Day 6/7) — drives the "View return" link on this page. */
  hasActiveReturn: boolean;
  items: AdminOrderItemView[];
}

export interface AdminOrderSummaryView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  contactName: string;
  contactEmail: string;
  totalPaise: number;
  itemCount: number;
  placedAt: string;
}

export interface ListOrdersParams {
  status?: OrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ListOrdersParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return query.toString();
}

export function listOrders(params: ListOrdersParams, accessToken: string): Promise<{ items: AdminOrderSummaryView[]; total: number }> {
  return apiFetch(`/api/v1/admin/orders?${toQuery(params)}`, { accessToken });
}

export function getOrder(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}`, { accessToken });
}

export function startProcessing(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/processing`, { method: "POST", accessToken });
}

export function ship(id: string, input: ShipOrderInput, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/ship`, { method: "POST", body: input, accessToken });
}

export function deliver(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/deliver`, { method: "POST", accessToken });
}

export function cancel(id: string, input: CancelOrderInput, accessToken: string): Promise<{ order: AdminOrderView; refundIssued: boolean }> {
  return apiFetch(`/api/v1/admin/orders/${id}/cancel`, { method: "POST", body: input, accessToken });
}
