// Composition root for the settings module (ARCHITECTURE.md §3.2), 2026-09-28.
// Owns (ADR-010): AppConfig — store-wide switches and presets that are neither
// pricing (PricingSetting, `pricing`) nor shipping (ShippingRule, `shipping`)
// rules. Public GET /settings/config/public here; the admin read/write is
// exported for the `admin` module's thin HTTP gateway (ADR-025). Depends only
// on `shipping` and `pricing` (read-only), and nothing it imports depends back on it.
import { bumpCatalogCacheVersion } from "../../shared/cache/catalog-cache";
import { getPricingSettingUseCase } from "../pricing/pricing.module";
import { getShippingRuleUseCase } from "../shipping/shipping.module";
import type { AppConfigRepositoryPort } from "./application/ports/app-config-repository.port";
import type { PricingRateReaderPort } from "./application/ports/pricing-rate-reader.port";
import type { ShippingRuleReaderPort } from "./application/ports/shipping-rule-reader.port";
import { GetAppConfigUseCase } from "./application/use-cases/get-app-config.use-case";
import { GetPublicAppConfigUseCase } from "./application/use-cases/get-public-app-config.use-case";
import { UpdateAppConfigUseCase } from "./application/use-cases/update-app-config.use-case";
import { AppConfigRepository } from "./infrastructure/repositories/app-config.repository";
import { SettingsController } from "./interface/http/settings.controller";
import { createSettingsRouter } from "./interface/http/settings.routes";

const baseAppConfigRepository = new AppConfigRepository();
/**
 * The homepage payload (cached as a whole in home.module.ts) embeds the
 * Shop by Budget tiles (2026-09-29), so a tiles save bumps the shared catalog
 * cache version — the same invalidation every catalog write uses — and the
 * admin sees the change on the next homepage load, not up to a TTL later.
 */
const appConfigRepository: AppConfigRepositoryPort = {
  get: () => baseAppConfigRepository.get(),
  update: async (patch) => {
    const record = await baseAppConfigRepository.update(patch);
    if (patch.budgetTiles !== undefined) await bumpCatalogCacheVersion();
    return record;
  },
};
const shippingRuleReader: ShippingRuleReaderPort = { getCurrent: () => getShippingRuleUseCase.execute() };
const pricingRateReader: PricingRateReaderPort = {
  getCurrentRatePerKgPaise: async () => (await getPricingSettingUseCase.execute()).ratePerKgPaise,
};

/** Exported for in-process readers (orders' minimum-quantity check, returns' feature flag) and the admin gateway. */
export const getAppConfigUseCase = new GetAppConfigUseCase(appConfigRepository);
export const updateAppConfigUseCase = new UpdateAppConfigUseCase(appConfigRepository);
export const getPublicAppConfigUseCase = new GetPublicAppConfigUseCase(appConfigRepository, shippingRuleReader, pricingRateReader);

export const router = createSettingsRouter(new SettingsController(getPublicAppConfigUseCase));
