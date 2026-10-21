import type { AiImageRepositoryPort } from "../ports/ai-image-repository.port";
import type { GenerationQueuePort } from "../ports/generation-queue.port";

/**
 * Redis is disposable (ADR-017): a flush or a worker crash can strand rows
 * in PENDING/PROCESSING with no job behind them. Run at worker start-up and
 * periodically; re-enqueueing is safe because claimForProcessing is atomic.
 */
export class RecoverStaleGenerationsUseCase {
  constructor(
    private readonly repository: AiImageRepositoryPort,
    private readonly queue: GenerationQueuePort,
    private readonly staleAfterMs = 10 * 60 * 1000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<number> {
    const ids = await this.repository.findStaleImageIds(new Date(this.now().getTime() - this.staleAfterMs));
    for (const id of ids) {
      await this.repository.releaseForRetry(id);
      await this.queue.enqueue(id);
    }
    return ids.length;
  }
}
