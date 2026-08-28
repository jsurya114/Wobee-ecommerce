import { NotFoundError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { ReturnRepositoryPort } from "../ports/return-repository.port";

/**
 * Customer-facing single-return lookup. Ownership is checked via the
 * parent order (a Return has no `userId` of its own) — same "not found
 * vs. not yours" indistinguishability every other customer-facing lookup
 * in this codebase uses.
 */
export class GetReturnUseCase {
  constructor(
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly orderReader: OrderReaderPort,
  ) {}

  async execute(returnId: string, userId: string): Promise<ReturnEntity> {
    const found = await this.returnRepository.findById(returnId);
    if (!found) {
      throw new NotFoundError("Return not found");
    }
    // Throws NotFoundError itself if the order isn't this user's — the
    // return is only reachable through an order the caller can already see.
    await this.orderReader.forCustomer(found.orderId, userId);
    return found;
  }
}
