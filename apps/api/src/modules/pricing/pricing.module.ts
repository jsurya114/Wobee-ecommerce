// Composition root for the pricing module (ARCHITECTURE.md §3.2). No public
// HTTP surface — this module's consumers are other modules calling
// `calculateEffectivePriceUseCase` in-process (products, cart), plus the
// admin module's thin HTTP gateway for Settings (2026-09-02, same pattern
// collections.module.ts/banners.module.ts already use).
import { Router } from "express";
import { CalculateEffectivePriceUseCase } from "./application/use-cases/calculate-effective-price.use-case";
import { CalculateGstUseCase } from "./application/use-cases/calculate-gst.use-case";
import { GetPricingSettingUseCase } from "./application/use-cases/admin/get-pricing-setting.use-case";
import { UpdatePricingSettingUseCase } from "./application/use-cases/admin/update-pricing-setting.use-case";
import { PricingRepository } from "./infrastructure/repositories/pricing.repository";

const pricingRepository = new PricingRepository();

export const calculateEffectivePriceUseCase = new CalculateEffectivePriceUseCase(pricingRepository);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const calculateGstUseCase = new CalculateGstUseCase(pricingRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const getPricingSettingUseCase = new GetPricingSettingUseCase(pricingRepository);
export const updatePricingSettingUseCase = new UpdatePricingSettingUseCase(pricingRepository);

export const router = Router();
