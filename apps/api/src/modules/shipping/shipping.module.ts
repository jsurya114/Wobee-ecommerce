import { Router } from "express";
import { EvaluateShippingUseCase } from "./application/use-cases/evaluate-shipping.use-case";
import { ShippingRepository } from "./infrastructure/repositories/shipping.repository";

/**
 * Composition root for the shipping module (ARCHITECTURE.md §3.2). No HTTP
 * surface yet — this week's consumers (cart's progress display, orders'
 * checkout) call `evaluateShippingUseCase` in-process. ADR-021's weight
 * thresholds and fee are read live from ShippingRule here — never
 * hardcoded, never computed client-side.
 */
const shippingRepository = new ShippingRepository();

export const evaluateShippingUseCase = new EvaluateShippingUseCase(shippingRepository);

export const router = Router();
