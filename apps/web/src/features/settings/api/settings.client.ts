import { apiFetch } from "@/lib/api-client";

/** Store settings exposed publicly by the API (2026-09-28) — everything here is already visible through the behaviour it controls. */
export interface PublicStoreConfig {
  minCartWeightGrams: number;
  minCartQuantity: number;
  freeDeliveryMinSubtotalPaise: number;
  returnsEnabled: boolean;
  codShippingUpfront: boolean;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
}

export function getPublicStoreConfig(): Promise<{ config: PublicStoreConfig }> {
  return apiFetch("/api/v1/settings/config/public");
}
