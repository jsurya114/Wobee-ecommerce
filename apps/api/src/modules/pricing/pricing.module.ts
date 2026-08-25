// Composition root for the pricing module (ARCHITECTURE.md §3.2). No HTTP
// surface yet — Week 1 doesn't need admin-editable rates, so this module's
// only consumers this week are other modules calling
// `calculateEffectivePriceUseCase` in-process (products, cart).
import { Router } from "express";
import { CalculateEffectivePriceUseCase } from "./application/use-cases/calculate-effective-price.use-case";
import { PricingRepository } from "./infrastructure/repositories/pricing.repository";

const pricingRepository = new PricingRepository();

export const calculateEffectivePriceUseCase = new CalculateEffectivePriceUseCase(pricingRepository);

export const router = Router();
