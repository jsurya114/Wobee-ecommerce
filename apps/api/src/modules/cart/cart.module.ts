import { Router } from "express";

/**
 * cart module — placeholder composition root.
 * Owns (ADR-010): Cart, CartItem.
 * Built out: Week 1 Day 3. Guest cart_id cookie + merge-on-login with stock
 * revalidation (ADR-011); weight/price/subtotal always recalculated
 * server-side on every read, never trusted from the client.
 */
export const router = Router();
