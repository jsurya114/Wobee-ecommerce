import { apiFetch } from "@/lib/api-client";

export interface AdminBanner {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
}

export interface BannerPayload {
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

export function listBanners(accessToken: string): Promise<{ banners: AdminBanner[] }> {
  return apiFetch("/api/v1/admin/banners", { accessToken });
}

export function getBanner(id: string, accessToken: string): Promise<{ banner: AdminBanner }> {
  return apiFetch(`/api/v1/admin/banners/${id}`, { accessToken });
}

export function createBanner(input: BannerPayload, accessToken: string): Promise<{ banner: AdminBanner }> {
  return apiFetch("/api/v1/admin/banners", { method: "POST", body: input, accessToken });
}

export function updateBanner(id: string, input: Partial<BannerPayload>, accessToken: string): Promise<{ banner: AdminBanner }> {
  return apiFetch(`/api/v1/admin/banners/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setBannerActive(id: string, isActive: boolean, accessToken: string): Promise<{ banner: AdminBanner }> {
  return apiFetch(`/api/v1/admin/banners/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function deleteBanner(id: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/banners/${id}`, { method: "DELETE", accessToken });
}

export function reorderBanners(bannerIds: string[], accessToken: string): Promise<void> {
  return apiFetch("/api/v1/admin/banners/order", { method: "PUT", body: { bannerIds }, accessToken });
}
