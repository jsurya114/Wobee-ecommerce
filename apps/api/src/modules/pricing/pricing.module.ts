// Composition root for the pricing module (ARCHITECTURE.md §3.2). No HTTP
// surface yet — Week 1 doesn't need admin-editable rates, so this module's
// only consumers this week are other modules calling
// `calculateEffectivePriceUseCase` in-process (products, cart).
import { Router } from "express";
import { CalculateEffectivePriceUseCase } from "./application/use-cases/calculate-effective-price.use-case";
import { CalculateGstUseCase } from "./application/use-cases/calculate-gst.use-case";
import { PricingRepository } from "./infrastructure/repositories/pricing.repository";

const pricingRepository = new PricingRepository();

export const calculateEffectivePriceUseCase = new CalculateEffectivePriceUseCase(pricingRepository);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const calculateGstUseCase = new CalculateGstUseCase(pricingRepository);

export const router = Router();
