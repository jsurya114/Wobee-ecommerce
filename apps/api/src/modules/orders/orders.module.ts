import { Router } from "express";

/**
 * orders module — placeholder composition root.
 * Owns (ADR-010): Order, OrderItem.
 * Built out: Week 1 Day 4. Owns the order state machine (plan.md §4) in its
 * domain layer — other modules (payments, returns) trigger transitions by
 * calling this module's use-cases through its ports, never by writing to
 * the Order table themselves (ARCHITECTURE.md §3.3).
 */
export const router = Router();
