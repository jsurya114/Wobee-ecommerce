import type { ListOrdersFilter, ListOrdersResult, OrderRepositoryPort } from "../ports/order-repository.port";

/** Admin order list — no userId scoping, unlike ListMyOrdersUseCase (ADR-025's admin order view). */
export class ListOrdersUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(filter: ListOrdersFilter): Promise<ListOrdersResult> {
    return this.orderRepository.findAllPaginated(filter);
  }
}
