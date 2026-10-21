import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../../../config/env";
import type { GenerationQueuePort } from "../../application/ports/generation-queue.port";

export const AI_IMAGES_QUEUE_NAME = "ai-images";

/** Dedicated connection for the same reason as notification.queue.ts (BullMQ needs maxRetriesPerRequest: null). */
export const aiImageQueueConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const queue = new Queue(AI_IMAGES_QUEUE_NAME, { connection: aiImageQueueConnection });

/**
 * The jobId carries a random suffix so a regeneration can re-queue an id whose
 * earlier failed job BullMQ still retains (removeOnFail). Idempotency is not
 * the queue's job here: ProcessGeneratedImageUseCase's atomic PENDING ->
 * PROCESSING claim makes a duplicate job a no-op.
 */
export class BullMqGenerationQueue implements GenerationQueuePort {
  async enqueue(generatedImageId: string): Promise<void> {
    await queue.add(
      "generate",
      { generatedImageId },
      {
        jobId: `${generatedImageId}-${randomUUID()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }
}
