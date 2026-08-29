import { apiFetch } from "@/lib/api-client";

export interface AdminCustomerSummary {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  totalPaise: number;
  itemCount: number;
  placedAt: string;
}

export interface CustomerAddress {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface CustomerActivity {
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: string | null;
}

export interface AdminCustomerDetail {
  customer: AdminCustomerSummary;
  orders: CustomerOrderSummary[];
  addresses: CustomerAddress[];
  activity: CustomerActivity;
}

export interface ListCustomersParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ListCustomersParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.isActive !== undefined) query.set("isActive", String(params.isActive));
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return query.toString();
}

export function listCustomers(params: ListCustomersParams, accessToken: string): Promise<{ items: AdminCustomerSummary[]; total: number }> {
  return apiFetch(`/api/v1/admin/customers?${toQuery(params)}`, { accessToken });
}

export function getCustomer(id: string, accessToken: string): Promise<AdminCustomerDetail> {
  return apiFetch(`/api/v1/admin/customers/${id}`, { accessToken });
}

export function setCustomerActive(id: string, isActive: boolean, accessToken: string): Promise<{ customer: AdminCustomerSummary }> {
  return apiFetch(`/api/v1/admin/customers/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}
