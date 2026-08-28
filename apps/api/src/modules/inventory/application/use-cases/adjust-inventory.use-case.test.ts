import { describe, expect, it, vi } from "vitest";
import { AdjustInventoryUseCase } from "./adjust-inventory.use-case";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

const actor = { id: "staff-1", role: "PRODUCT_MANAGEMENT_STAFF" as const };

describe("AdjustInventoryUseCase", () => {
  it("adjusts the quantity and logs who did it and why", async () => {
    const inventoryRepository = {
      adjustQuantity: vi.fn().mockResolvedValue({ variantId: "v1", quantityAvailable: 15, quantityReserved: 2 }),
    } as unknown as InventoryRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const useCase = new AdjustInventoryUseCase(inventoryRepository, auditLogger);

    const result = await useCase.execute("v1", 5, "Restock from supplier", actor);

    expect(inventoryRepository.adjustQuantity).toHaveBeenCalledWith("v1", 5);
    expect(result.quantityAvailable).toBe(15);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INVENTORY_ADJUSTED",
        entityId: "v1",
        metadata: { delta: 5, reason: "Restock from supplier", newQuantityAvailable: 15 },
      }),
    );
  });

  it("propagates the repository's validation error and never logs a failed adjustment", async () => {
    const inventoryRepository = {
      adjustQuantity: vi.fn().mockRejectedValue(new Error("This adjustment would make available stock negative")),
    } as unknown as InventoryRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const useCase = new AdjustInventoryUseCase(inventoryRepository, auditLogger);

    await expect(useCase.execute("v1", -100, "typo", actor)).rejects.toThrow(/negative/i);
    expect(auditLogger.log).not.toHaveBeenCalled();
  });
});
