import { Router } from "express";

/**
 * pricing module — placeholder composition root.
 * Owns (ADR-010): PricingSetting.
 * Built out: Week 1 Day 3. The weight -> price formula itself is a pure
 * function in this module's domain layer (see packages/utils/src/weight.ts
 * for the reference implementation used to seed demo data) — no I/O, unit
 * tested directly, callable only through this module's application layer
 * (DEVELOPMENT_RULES.md #1).
 */
export const router = Router();
