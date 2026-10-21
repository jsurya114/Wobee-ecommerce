import { ServiceUnavailableError, TooManyRequestsError, ValidationError } from "../../../../shared/errors";
import type { AiGenerationEntity, AiImageAngle } from "../../domain/ai-image";
import type { AiImageRepositoryPort } from "../ports/ai-image-repository.port";
import type { GenerationQueuePort } from "../ports/generation-queue.port";
import type { MediaGatewayPort } from "../ports/media-gateway.port";
import type { ProductGatewayPort } from "../ports/product-gateway.port";

const SUPPORTED_SOURCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface RequestGenerationCommand {
  productId: string;
  sourceMediaId: string;
  angles: AiImageAngle[];
  requestedByUserId: string;
}

export interface RequestGenerationConfig {
  enabled: boolean;
  providerName: string;
  dailyLimit: number;
}

export class RequestGenerationUseCase {
  constructor(
    private readonly repository: AiImageRepositoryPort,
    private readonly queue: GenerationQueuePort,
    private readonly media: MediaGatewayPort,
    private readonly products: ProductGatewayPort,
    private readonly config: RequestGenerationConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: RequestGenerationCommand): Promise<AiGenerationEntity> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableError("AI model photo generation is not enabled");
    }
    const angles = [...new Set(command.angles)];
    if (angles.length === 0) {
      throw new ValidationError("Choose at least one angle");
    }

    await this.products.getProductName(command.productId);
    const source = await this.media.getActiveImage(command.sourceMediaId);
    if (!SUPPORTED_SOURCE_MIME_TYPES.has(source.mimeType)) {
      throw new ValidationError("Model photos can only be generated from JPEG, PNG or WebP images");
    }

    const startOfUtcDay = new Date(this.now());
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const usedToday = await this.repository.countImagesRequestedSince(startOfUtcDay);
    if (usedToday + angles.length > this.config.dailyLimit) {
      throw new TooManyRequestsError("Daily AI image generation limit reached — try again tomorrow");
    }

    const generation = await this.repository.createGeneration({
      productId: command.productId,
      sourceMediaId: command.sourceMediaId,
      createdByUserId: command.requestedByUserId,
      provider: this.config.providerName,
      angles,
    });

    // A failed enqueue is not fatal: the rows are already PENDING in Postgres and the
    // recovery sweep (RecoverStaleGenerationsUseCase) re-enqueues anything left behind.
    await Promise.all(generation.images.map((image) => this.queue.enqueue(image.id).catch(() => undefined)));
    return generation;
  }
}
