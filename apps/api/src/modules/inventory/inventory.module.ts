// Composition root for the inventory module (ARCHITECTURE.md §3.2). No HTTP
// surface yet — this week's consumers (products, cart, orders, payments)
// call these use-cases in-process. Reservation/locking (ADR-015) lands Week
// 1 Day 4; finalize/release (the rest of the reservation lifecycle) lands
// Day 5 alongside payment confirmation — all on the same InventoryRepository.
import { Router } from "express";
import { recordAuditLogUseCase } from "../audit/audit.module";
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import { AdjustInventoryUseCase } from "./application/use-cases/adjust-inventory.use-case";
import { FinalizeReservationUseCase } from "./application/use-cases/finalize-reservation.use-case";
import { FindInStockVariantIdsUseCase } from "./application/use-cases/find-in-stock-variant-ids.use-case";
import { GetAvailableQuantitiesUseCase } from "./application/use-cases/get-available-quantities.use-case";
import { InitializeInventoryForVariantUseCase } from "./application/use-cases/initialize-inventory-for-variant.use-case";
import { ListInventoryAdminUseCase } from "./application/use-cases/list-inventory-admin.use-case";
import { ReleaseReservationUseCase } from "./application/use-cases/release-reservation.use-case";
import { RestockFinalizedSaleUseCase } from "./application/use-cases/restock-finalized-sale.use-case";
import { ReserveInventoryForCheckoutUseCase } from "./application/use-cases/reserve-inventory-for-checkout.use-case";
import { InventoryRepository } from "./infrastructure/repositories/inventory.repository";

const inventoryRepository = new InventoryRepository();
const auditLogger: AuditLoggerPort = { log: (entry) => recordAuditLogUseCase.execute(entry) };

export const getAvailableQuantitiesUseCase = new GetAvailableQuantitiesUseCase(inventoryRepository);
/** Exported for cross-module use — see each use-case's own doc comment. */
export const reserveInventoryForCheckoutUseCase = new ReserveInventoryForCheckoutUseCase(inventoryRepository);
export const finalizeReservationUseCase = new FinalizeReservationUseCase(inventoryRepository);
export const releaseReservationUseCase = new ReleaseReservationUseCase(inventoryRepository);
/** Week 2 Day 0 remediation — see the use-case's own doc comment. */
export const restockFinalizedSaleUseCase = new RestockFinalizedSaleUseCase(inventoryRepository);
/** Week 2 Day 1 — see the use-case's own doc comment. */
export const findInStockVariantIdsUseCase = new FindInStockVariantIdsUseCase(inventoryRepository);
/** Week 2 Day 7 — exported for `products`' own InventoryInitializerPort adapter (new-variant creation). */
export const initializeInventoryForVariantUseCase = new InitializeInventoryForVariantUseCase(inventoryRepository);
/** Week 2 Day 7 — exported for `admin`'s HTTP layer (ADR-025), same pattern every other module's admin-facing exports use. */
export const listInventoryAdminUseCase = new ListInventoryAdminUseCase(inventoryRepository);
export const adjustInventoryUseCase = new AdjustInventoryUseCase(inventoryRepository, auditLogger);

export const router = Router();
