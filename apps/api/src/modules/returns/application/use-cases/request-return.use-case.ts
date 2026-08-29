import { UnprocessableEntityError } from "../../../../shared/errors";
import type { ReturnEntity } from "../../domain/entities/return.entity";
import { resolveReturnEligibility } from "../../domain/resolve-return-eligibility";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { OrderReturnFlagWriterPort } from "../ports/order-return-flag-writer.port";
import type { CreateReturnItemInput, ReturnRepositoryPort } from "../ports/return-repository.port";

export interface RequestReturnInput {
  orderId: string;
  userId: string;
  reason: string;
  items: CreateReturnItemInput[];
}

/**
 * week2 (1).md §11's customer-facing entry point — `Customer -> Eligible
 * order item -> Return request -> Reason`. `orderReader.forCustomer`
 * throws NotFoundError itself for a missing/not-owned order (GetOrderUseCase's
 * own ownership-check pattern), so this use-case doesn't need its own
 * ownership check on top of it.
 */
export class RequestReturnUseCase {
  constructor(
    private readonly orderReader: OrderReaderPort,
    private readonly returnRepository: ReturnRepositoryPort,
    private readonly orderReturnFlagWriter: OrderReturnFlagWriterPort,
  ) {}

  async execute(input: RequestReturnInput): Promise<ReturnEntity> {
    const order = await this.orderReader.forCustomer(input.orderId, input.userId);
    const existingReturnLines = await this.returnRepository.findLinesByOrderId(input.orderId);

    const eligibility = resolveReturnEligibility({
      now: new Date(),
      orderStatus: order.status,
      deliveredAt: order.deliveredAt,
      orderItems: order.items.map((item) => ({ id: item.id, quantity: item.quantity })),
      existingReturnLines,
      requestedLines: input.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
    });
    if (!eligibility.ok) {
      throw new UnprocessableEntityError(eligibility.reason ?? "This return request can't be submitted");
    }

    const created = await this.returnRepository.create({ orderId: input.orderId, reason: input.reason, items: input.items });
    // Best-effort denormalized flag (schema.prisma's own "admin filtering
    // only" comment) — a failure here shouldn't fail the return request
    // itself, but there's no real failure mode expected of a plain update,
    // so this is not wrapped defensively the way e.g. markRefunded is.
    await this.orderReturnFlagWriter.setHasActiveReturn(input.orderId, true);
    return created;
  }
}
