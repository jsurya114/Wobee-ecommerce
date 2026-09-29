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

/** Store settings (AppConfig singleton, 2026-09-28) — MANAGE_SETTINGS only. */
export interface AppConfig {
  minCartQuantity: number;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
  returnsEnabled: boolean;
  /** COD orders with a delivery fee prepay that fee online (2026-09-28). */
  codShippingUpfront: boolean;
  updatedAt: string | null;
}

export type AppConfigPatch = Partial<Omit<AppConfig, "updatedAt">>;

export function getAppConfig(
  accessToken: string,
): Promise<{ config: AppConfig }> {
  return apiFetch("/api/v1/admin/settings/config", { accessToken });
}

export function updateAppConfig(
  patch: AppConfigPatch,
  accessToken: string,
): Promise<{ config: AppConfig }> {
  return apiFetch("/api/v1/admin/settings/config", {
    method: "PATCH",
    body: patch,
    accessToken,
  });
}

/** Cart & shipping rules (ShippingRule, versioned) — money in integer paise, weight in integer grams. */
export interface ShippingRule {
  minWeightGramsForCheckout: number;
  freeDeliveryThresholdGrams: number;
  standardFeePaise: number;
  freeDeliveryMinSubtotalPaise: number;
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
  effectiveFrom: string;
}

export type ShippingRulePatch = Partial<
  Pick<
    ShippingRule,
    | "minWeightGramsForCheckout"
    | "freeDeliveryThresholdGrams"
    | "standardFeePaise"
    | "freeDeliveryMinSubtotalPaise"
  >
>;

export function getShippingRule(
  accessToken: string,
): Promise<{ rule: ShippingRule }> {
  return apiFetch("/api/v1/admin/settings/shipping", { accessToken });
}

export function updateShippingRule(
  patch: ShippingRulePatch,
  accessToken: string,
): Promise<{ rule: ShippingRule }> {
  return apiFetch("/api/v1/admin/settings/shipping", {
    method: "PATCH",
    body: patch,
    accessToken,
  });
}

/** Public, unauthenticated subset — readable by every staff role (e.g. catalog staff need the presets). */
export interface PublicAppConfig {
  minCartWeightGrams: number;
  minCartQuantity: number;
  freeDeliveryMinSubtotalPaise: number;
  returnsEnabled: boolean;
  codShippingUpfront: boolean;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
  /** Current global ₹/kg rate in paise (2026-09-29) — drives the weight-based price preview in VariantForm. */
  ratePerKgPaise: number;
}

export function getPublicAppConfig(): Promise<{ config: PublicAppConfig }> {
  return apiFetch("/api/v1/settings/config/public");
}
