import { Router } from "express";

/**
 * shipping module — placeholder composition root.
 * Owns (ADR-010): ShippingRule.
 * Built out: Week 1 Day 4. Weight-based minimum order threshold (1,000g) and
 * free-delivery threshold (1,500g) — ADR-021. Fee/threshold logic here;
 * checkout-blocking validation + progress data in the cart module. Cart
 * weight and shipping fee are never computed client-side.
 */
export const router = Router();
