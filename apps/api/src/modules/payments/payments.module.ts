import { Router } from "express";

/**
 * payments module — placeholder composition root.
 * Owns (ADR-010): Payment, WebhookEvent.
 * Built out: Week 1 Day 5. Razorpay Orders API + webhook signature
 * verification + (provider, eventId) idempotency (ADR-014). Order moves to
 * CONFIRMED only after webhook-verified capture, never the client redirect
 * alone (DEVELOPMENT_RULES.md #3).
 */
export const router = Router();
