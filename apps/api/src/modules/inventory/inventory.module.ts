import { Router } from "express";

/**
 * inventory module — placeholder composition root.
 * Owns (ADR-010): Inventory, Warehouse.
 * Built out: Week 1 Day 4. Reservation on checkout uses
 * `SELECT ... FOR UPDATE` on the variant's inventory row inside the
 * checkout transaction (ADR-015) — correctness non-negotiable, one of the
 * four mandatory concurrency tests targets this directly.
 */
export const router = Router();
