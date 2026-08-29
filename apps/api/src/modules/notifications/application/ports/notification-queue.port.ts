/**
 * Abstracts BullMQ out of the application layer (ARCHITECTURE.md §3.1) —
 * only infrastructure/queues/notification.queue.ts imports the real
 * library. `enqueue` only ever carries the notification's own id, never
 * its payload: the worker re-reads the row from Postgres before sending,
 * so Redis is disposable exactly per ADR-017 (never the source of truth) —
 * a flushed queue loses nothing that a `findById` can't recover, and this
 * is what keeps EnqueueNotificationUseCase's own two steps (DB write, then
 * queue.add) safe to fail independently between them without corrupting
 * anything worse than "this one notification silently never sends," the
 * same accepted gap this codebase already lives with for post-commit
 * side effects (e.g. CancelOrderWithRefundUseCase's own refund attempt).
 */
export interface NotificationQueuePort {
  enqueue(notificationId: string): Promise<void>;
}
