import { Router } from "express";

/**
 * refunds module — placeholder composition root.
 * Owns (ADR-010): Refund.
 * Built out: Week 4. Idempotent per (provider, eventId)-style dedup, same
 * pattern as payment webhooks. Explicitly deferred this week.
 */
export const router = Router();
