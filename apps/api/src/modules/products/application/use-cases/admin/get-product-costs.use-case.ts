import { NotFoundError } from "../../../../../shared/errors";
import type { ProductCostsRepositoryPort, ProductCostsView } from "../../ports/product-repository.port";

/** Cost-entry read model for one product (business analytics, 2026-09-21). Confidential — gated by the analytics permission at the route, never folded into a customer-facing product shape. */
export class GetProductCostsUseCase {
  constructor(private readonly repository: ProductCostsRepositoryPort) {}

  async execute(productId: string): Promise<ProductCostsView> {
    const costs = await this.repository.findCosts(productId);
    if (!costs) throw new NotFoundError("Product not found");
    return costs;
  }
}
