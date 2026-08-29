import { apiFetch } from "@/lib/api-client";

export type ReturnStatus = "RETURN_REQUESTED" | "RETURN_APPROVED" | "RETURN_REJECTED" | "REFUND_INITIATED" | "REFUNDED";

export interface AdminReturnSummaryView {
  id: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string;
  requestedAt: string;
  resolvedAt: string | null;
  itemCount: number;
  contactName: string;
  contactEmail: string;
}

export interface AdminReturnItemView {
  id: string;
  orderItemId: string;
  quantity: number;
  reasonDetail: string | null;
}

export interface AdminReturnEntity {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: string;
  requestedAt: string;
  resolvedAt: string | null;
  items: AdminReturnItemView[];
}

export interface AdminReturnOrderItemView {
  id: string;
  variantId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPricePaise: number;
  taxAmountPaise: number;
}

export interface AdminReturnOrderView {
  id: string;
  userId: string | null;
  status: string;
  deliveredAt: string | null;
  items: AdminReturnOrderItemView[];
}

export interface AdminReturnDetailView {
  return: AdminReturnEntity;
  order: AdminReturnOrderView;
}

export interface ListReturnsParams {
  status?: ReturnStatus;
  /** Narrows to one order's own returns — backs the admin order-detail "return requested" link (Week 2 Day 7). */
  orderId?: string;
  page?: number;
  pageSize?: number;
}

export interface IssueRefundResult {
  return: AdminReturnEntity;
  outcome: "completed" | "failed" | "not-applicable";
}

function toQuery(params: ListReturnsParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.orderId) query.set("orderId", params.orderId);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return query.toString();
}

export function listReturns(params: ListReturnsParams, accessToken: string): Promise<{ items: AdminReturnSummaryView[]; total: number }> {
  return apiFetch(`/api/v1/admin/returns?${toQuery(params)}`, { accessToken });
}

export function getReturn(id: string, accessToken: string): Promise<AdminReturnDetailView> {
  return apiFetch(`/api/v1/admin/returns/${id}`, { accessToken });
}

export function approve(id: string, accessToken: string): Promise<AdminReturnEntity> {
  return apiFetch(`/api/v1/admin/returns/${id}/approve`, { method: "POST", accessToken });
}

export function reject(id: string, input: { reason?: string }, accessToken: string): Promise<AdminReturnEntity> {
  return apiFetch(`/api/v1/admin/returns/${id}/reject`, { method: "POST", body: input, accessToken });
}

export function issueRefund(id: string, accessToken: string): Promise<IssueRefundResult> {
  return apiFetch(`/api/v1/admin/returns/${id}/refund`, { method: "POST", accessToken });
}

export function markRefunded(id: string, accessToken: string): Promise<AdminReturnEntity> {
  return apiFetch(`/api/v1/admin/returns/${id}/mark-refunded`, { method: "POST", accessToken });
}
