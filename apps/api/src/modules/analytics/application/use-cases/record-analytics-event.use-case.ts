import type { AnalyticsEventInput } from "@woobe/validation";
import type { AnalyticsEventRepositoryPort } from "../ports/analytics-event-repository.port";

/**
 * Records one storefront analytics event. Idempotent by construction: the
 * dedupe key is fixed for once-per-session steps (session start, add-to-cart,
 * checkout) and the product id for product views, so a retried request or a
 * re-fired hook never inflates the funnel. `userId` is attached only when the
 * shopper is signed in; the anonymous session id is the sole identity
 * otherwise.
 */
export class RecordAnalyticsEventUseCase {
  constructor(private readonly repository: AnalyticsEventRepositoryPort) {}

  async execute(event: AnalyticsEventInput, userId: string | null): Promise<{ recorded: boolean }> {
    const recorded = await this.repository.record({
      type: event.type,
      sessionId: event.sessionId,
      dedupeKey: event.type === "PRODUCT_VIEWED" ? event.productId! : "once",
      productId: event.type === "PRODUCT_VIEWED" ? event.productId! : null,
      userId,
    });
    return { recorded };
  }
}
