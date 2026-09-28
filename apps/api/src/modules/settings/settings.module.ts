// Composition root for the settings module (ARCHITECTURE.md §3.2), 2026-09-28.
// Owns (ADR-010): AppConfig — store-wide switches and presets that are neither
// pricing (PricingSetting, `pricing`) nor shipping (ShippingRule, `shipping`)
// rules. Public GET /settings/config/public here; the admin read/write is
// exported for the `admin` module's thin HTTP gateway (ADR-025). Depends only
// on `shipping` (read-only), and nothing it imports depends back on it.
import { getShippingRuleUseCase } from "../shipping/shipping.module";
import type { ShippingRuleReaderPort } from "./application/ports/shipping-rule-reader.port";
import { GetAppConfigUseCase } from "./application/use-cases/get-app-config.use-case";
import { GetPublicAppConfigUseCase } from "./application/use-cases/get-public-app-config.use-case";
import { UpdateAppConfigUseCase } from "./application/use-cases/update-app-config.use-case";
import { AppConfigRepository } from "./infrastructure/repositories/app-config.repository";
import { SettingsController } from "./interface/http/settings.controller";
import { createSettingsRouter } from "./interface/http/settings.routes";

const appConfigRepository = new AppConfigRepository();
const shippingRuleReader: ShippingRuleReaderPort = { getCurrent: () => getShippingRuleUseCase.execute() };

/** Exported for in-process readers (orders' minimum-quantity check, returns' feature flag) and the admin gateway. */
export const getAppConfigUseCase = new GetAppConfigUseCase(appConfigRepository);
export const updateAppConfigUseCase = new UpdateAppConfigUseCase(appConfigRepository);
export const getPublicAppConfigUseCase = new GetPublicAppConfigUseCase(appConfigRepository, shippingRuleReader);

export const router = createSettingsRouter(new SettingsController(getPublicAppConfigUseCase));
