import { NotFoundError, TooManyRequestsError } from "../../../../shared/errors";
import { canClaimGuestOrder } from "../../domain/can-claim-guest-order";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { ClaimAttemptLimiterPort } from "../ports/claim-attempt-limiter.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

export interface ClaimGuestOrderCommand {
  userId: string;
  orderNumber: string;
  contactEmail: string;
}

/**
 * Client-review fix (2026-09-03): a guest order's `userId` is set once, at
 * checkout, and never revisited (GetOrderUseCase's own doc comment
 * documents the resulting guest trust model — a guest order is readable by
 * its unguessable id alone, with no path back to an account). A customer
 * who checks out as a guest and later registers under the SAME email gets
 * no benefit from this use-case in particular — that's just as easy to
 * resolve by searching up the order here too, so no separate
 * auto-link-at-registration step was built. This use-case is what covers
 * BOTH cases uniformly: the customer proves they hold BOTH the order
 * number (delivered only via the confirmation page/email — see
 * OrderNumberGeneratorService; 48 bits of crypto-random suffix, never
 * guessable) AND the exact email the order was placed under, and the
 * order attaches to whichever logged-in account asks first.
 *
 * NotFoundError is thrown uniformly for "no such order", "wrong email",
 * and "already claimed" — same don't-reveal-more-than-necessary posture
 * GetOrderUseCase already documents; this must never become an oracle for
 * guessing valid order numbers or the email behind one.
 */
export class ClaimGuestOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly attemptLimiter: ClaimAttemptLimiterPort,
  ) {}

  async execute(input: ClaimGuestOrderCommand): Promise<OrderEntity> {
    const allowed = await this.attemptLimiter.allow(input.userId);
    if (!allowed) {
      throw new TooManyRequestsError("Too many attempts — please try again later");
    }

    const order = await this.orderRepository.findByOrderNumber(input.orderNumber);
    if (!order || !canClaimGuestOrder(order, input.contactEmail)) {
      throw new NotFoundError("No matching guest order found");
    }

    const claimed = await this.orderRepository.attachToUser(order.id, input.userId);
    if (!claimed) {
      // Lost a race with a concurrent claim between the read above and this
      // write (someone else's, or a duplicate submission) — same generic
      // response; nothing here is distinguishable from "not found" to the caller.
      throw new NotFoundError("No matching guest order found");
    }

    return { ...order, userId: input.userId };
  }
}
