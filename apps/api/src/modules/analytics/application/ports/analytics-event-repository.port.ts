export type RecordableAnalyticsEventType = "SESSION_STARTED" | "PRODUCT_VIEWED" | "CART_ADDED" | "CHECKOUT_STARTED";

export interface NewAnalyticsEvent {
  type: RecordableAnalyticsEventType;
  sessionId: string;
  /** Idempotency key within (sessionId, type) — see AnalyticsEvent in schema.prisma. */
  dedupeKey: string;
  productId: string | null;
  userId: string | null;
}

export interface AnalyticsEventRepositoryPort {
  /** Inserts the event unless (sessionId, type, dedupeKey) already exists. Returns whether a new row was written. */
  record(event: NewAnalyticsEvent): Promise<boolean>;
}
