import { Router } from "express";

/**
 * returns module — placeholder composition root.
 * Owns (ADR-010): Return, ReturnItem.
 * Built out: Week 4. Item-level, separate from Order.status (plan.md §4).
 * Explicitly deferred this week; schema exists now.
 */
export const router = Router();
