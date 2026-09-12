import { apiFetch } from "@/lib/api-client";

export type TestimonialStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminTestimonial {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  text: string;
  status: TestimonialStatus;
  images: { id: string; url: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ListAdminTestimonialsParams {
  status?: TestimonialStatus;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ListAdminTestimonialsParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return query.toString();
}

export function listTestimonials(params: ListAdminTestimonialsParams, accessToken: string): Promise<{ items: AdminTestimonial[]; total: number }> {
  return apiFetch(`/api/v1/admin/testimonials?${toQuery(params)}`, { accessToken });
}

export function approve(id: string, accessToken: string): Promise<{ testimonial: AdminTestimonial }> {
  return apiFetch(`/api/v1/admin/testimonials/${id}/approve`, { method: "POST", accessToken });
}

export function reject(id: string, accessToken: string): Promise<{ testimonial: AdminTestimonial }> {
  return apiFetch(`/api/v1/admin/testimonials/${id}/reject`, { method: "POST", accessToken });
}
