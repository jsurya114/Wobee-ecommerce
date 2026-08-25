import { Router } from "express";

/**
 * admin module — placeholder composition root.
 * Cross-cutting: reads from other modules through their ports, doesn't own
 * Prisma models of its own.
 * Built out: Week 1 Day 5 (basic order view only). Full admin dashboard —
 * product management, inventory, returns review — is Week 2-4 scope.
 */
export const router = Router();
