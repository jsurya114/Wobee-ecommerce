import { apiFetch } from "@/lib/api-client";

export interface PricingSetting {
  ratePerKgPaise: number;
  effectiveFrom: string;
}

export function getPricingSetting(accessToken: string): Promise<{ setting: PricingSetting }> {
  return apiFetch("/api/v1/admin/settings/pricing", { accessToken });
}

export function updatePricingSetting(ratePerKgPaise: number, accessToken: string): Promise<{ setting: PricingSetting }> {
  return apiFetch("/api/v1/admin/settings/pricing", { method: "PUT", body: { ratePerKgPaise }, accessToken });
}
