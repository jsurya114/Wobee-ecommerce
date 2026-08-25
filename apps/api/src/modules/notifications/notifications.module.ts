import { Router } from "express";

/**
 * notifications module — placeholder composition root.
 * Owns (ADR-010): Notification.
 * Built out: Week 1 Day 5 (core transactional jobs only — order confirmed,
 * payment failed — minimal BullMQ jobs). Full notification system
 * (shipped/delivered, marketing) is Week 4 scope.
 */
export const router = Router();
