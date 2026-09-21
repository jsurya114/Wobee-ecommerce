import { NotFoundError } from "../../../../../shared/errors";
import type { ProductCostsRepositoryPort, ProductCostsView } from "../../ports/product-repository.port";

export interface SetProductCostsCommand {
  costPerKgPaise?: number | null;
  variantCosts?: { variantId: string; costPricePaise: number | null }[];
}

/**
 * Sets a product's cost basis (business analytics, 2026-09-21): cost per kg
 * for a WEIGHT_BASED product, per-piece cost per variant for a FIXED one.
 * This only changes what FUTURE orders snapshot and what inventory-at-cost
 * reports — past OrderItems keep the unit cost they were created with.
 */
export class SetProductCostsUseCase {
  constructor(private readonly repository: ProductCostsRepositoryPort) {}

  async execute(productId: string, command: SetProductCostsCommand): Promise<ProductCostsView> {
    const updated = await this.repository.setCosts(productId, command);
    if (!updated) throw new NotFoundError("Product not found");
    const costs = await this.repository.findCosts(productId);
    if (!costs) throw new NotFoundError("Product not found");
    return costs;
  }
}
