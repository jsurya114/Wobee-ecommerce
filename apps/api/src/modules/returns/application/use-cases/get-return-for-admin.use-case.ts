import { NotFoundError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { OrderReaderPort, ReturnOrderView } from "../ports/order-reader.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

export interface ReturnForAdminView {
  return: ReturnEntity;
  order: ReturnOrderView;
}

/** Admin return detail — includes the order's own items so staff can see product names/prices, not just orderItemId references. */
export class GetReturnForAdminUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly orderReader: OrderReaderPort,
  ) {}

  async execute(returnId: string): Promise<ReturnForAdminView> {
    const found = await this.returnRepository.findById(returnId);
    if (!found) {
      throw new NotFoundError("Return not found");
    }
    const order = await this.orderReader.forAdmin(found.orderId);
    return { return: found, order };
  }
}
