// Composition root for the inventory module (ARCHITECTURE.md §3.2). No HTTP
// surface yet — this week's consumers (products, cart) call
// `getAvailableQuantitiesUseCase` in-process. Reservation/locking
// (ADR-015) lands Week 1 Day 4 on top of the same InventoryRepository.
import { Router } from "express";
import { GetAvailableQuantitiesUseCase } from "./application/use-cases/get-available-quantities.use-case";
import { InventoryRepository } from "./infrastructure/repositories/inventory.repository";

const inventoryRepository = new InventoryRepository();

export const getAvailableQuantitiesUseCase = new GetAvailableQuantitiesUseCase(inventoryRepository);

export const router = Router();
