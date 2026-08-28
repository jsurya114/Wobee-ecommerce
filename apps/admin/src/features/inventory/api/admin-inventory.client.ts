import { apiFetch } from "@/lib/api-client";

export interface AdminInventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantityAvailable: number;
  quantityReserved: number;
}

export interface ListInventoryParams {
  search?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AdjustInventoryResult {
  variantId: string;
  quantityAvailable: number;
  quantityReserved: number;
}

function toQuery(params: ListInventoryParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.lowStockOnly) query.set("lowStockOnly", "true");
  if (params.outOfStockOnly) query.set("outOfStockOnly", "true");
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return query.toString();
}

export function listInventory(params: ListInventoryParams, accessToken: string): Promise<{ items: AdminInventoryRow[]; total: number }> {
  return apiFetch(`/api/v1/admin/inventory?${toQuery(params)}`, { accessToken });
}

export function adjustInventory(variantId: string, delta: number, reason: string, accessToken: string): Promise<AdjustInventoryResult> {
  return apiFetch(`/api/v1/admin/inventory/${variantId}/adjust`, { method: "POST", body: { delta, reason }, accessToken });
}
