import type { ListProductsAdminFilter, ListProductsAdminResult } from "../../ports/product-repository.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/** Admin product list — unlike the customer-facing ListProductsUseCase, includes inactive products (RBAC-gated at the route, MANAGE_CATALOG). */
export class ListProductsAdminUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  execute(filter: ListProductsAdminFilter): Promise<ListProductsAdminResult> {
    return this.productRepository.findAllForAdmin(filter);
  }
}
