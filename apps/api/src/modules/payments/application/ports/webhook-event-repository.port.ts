export interface WebhookEventRecord {
  id: string;
  provider: string;
  eventId: string;
  processedAt: Date | null;
}

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1). Backs ADR-014's
 * `(provider, eventId)` unique-constraint dedup — the mandatory "duplicate
 * webhook delivery" defense.
 */
export interface WebhookEventRepositoryPort {
  findByProviderAndEventId(provider: string, eventId: string): Promise<WebhookEventRecord | null>;
  /** Throws WebhookEventAlreadyExistsError on a `(provider, eventId)` collision (DB unique constraint) — the caller treats that as "already being processed / already processed", not an error to surface. */
  create(provider: string, eventId: string, eventType: string, payload: unknown): Promise<WebhookEventRecord>;
  markProcessed(id: string): Promise<void>;
}
