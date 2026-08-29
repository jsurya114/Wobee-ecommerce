import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** Exported for `returns`' own OrderReturnFlagWriterPort adapter (Week 2 Day 6) — the only write `returns` may make onto Order (ADR-010). */
export class SetOrderHasActiveReturnUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(orderId: string, value: boolean): Promise<void> {
    return this.orderRepository.setHasActiveReturn(orderId, value);
  }
}
