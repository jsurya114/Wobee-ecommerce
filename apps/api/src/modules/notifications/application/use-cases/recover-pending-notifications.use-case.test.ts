import { describe, expect, it, vi } from "vitest";
import { PENDING_RECOVERY_AGE_MS, RecoverPendingNotificationsUseCase } from "./recover-pending-notifications.use-case";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

function pending(id: string): NotificationEntity {
  return { id, userId: null, type: "ORDER_SHIPPED", channel: "EMAIL", payload: {}, status: "PENDING", createdAt: new Date(0), sentAt: null };
}

describe("RecoverPendingNotificationsUseCase", () => {
  it("re-enqueues every long-pending row, looking back PENDING_RECOVERY_AGE_MS", async () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const repo = { findPendingOlderThan: vi.fn().mockResolvedValue([pending("a"), pending("b")]) };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const useCase = new RecoverPendingNotificationsUseCase(repo as never, queue, () => now);

    const result = await useCase.execute();

    expect(result).toEqual({ requeued: 2 });
    expect(repo.findPendingOlderThan).toHaveBeenCalledWith(new Date(now.getTime() - PENDING_RECOVERY_AGE_MS), expect.any(Number));
    expect(queue.enqueue.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("keeps going when one enqueue fails", async () => {
    const repo = { findPendingOlderThan: vi.fn().mockResolvedValue([pending("a"), pending("b")]) };
    const queue = { enqueue: vi.fn().mockRejectedValueOnce(new Error("redis down")).mockResolvedValueOnce(undefined) };
    const useCase = new RecoverPendingNotificationsUseCase(repo as never, queue);

    expect(await useCase.execute()).toEqual({ requeued: 1 });
  });
});
