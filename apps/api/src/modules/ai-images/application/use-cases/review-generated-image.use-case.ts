import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AiGeneratedImageEntity, AiImageAngle } from "../../domain/ai-image";
import type { AiImageRepositoryPort } from "../ports/ai-image-repository.port";
import type { GenerationQueuePort } from "../ports/generation-queue.port";
import type { MediaGatewayPort } from "../ports/media-gateway.port";
import type { ProductGatewayPort } from "../ports/product-gateway.port";

const ANGLE_LABEL: Record<AiImageAngle, string> = { FRONT: "front view", BACK: "back view", SIDE: "side view", DETAIL: "detail view" };

/** Approve / reject / regenerate — the admin's review step before an AI image can reach the storefront. */
export class ReviewGeneratedImageUseCase {
  constructor(
    private readonly repository: AiImageRepositoryPort,
    private readonly queue: GenerationQueuePort,
    private readonly media: MediaGatewayPort,
    private readonly products: ProductGatewayPort,
  ) {}

  async approve(generatedImageId: string): Promise<void> {
    const image = await this.requireImage(generatedImageId);
    if (image.status !== "READY" || !image.url) throw new ConflictError("Only a finished image can be approved");
    const productName = await this.products.getProductName(image.productId);

    // Settle first: the conditional READY -> APPROVED update is what stops a double click attaching twice.
    if (!(await this.repository.settleReady(generatedImageId, "APPROVED"))) {
      throw new ConflictError("This image was already reviewed");
    }
    try {
      await this.products.attachImage(image.productId, image.url, `${productName} – ${ANGLE_LABEL[image.angle]}`);
    } catch (error) {
      await this.repository.reopenApproved(generatedImageId);
      throw error;
    }
  }

  async reject(generatedImageId: string): Promise<void> {
    const image = await this.requireImage(generatedImageId);
    if (!(await this.repository.settleReady(generatedImageId, "REJECTED"))) {
      throw new ConflictError("Only a finished, unreviewed image can be rejected");
    }
    if (image.mediaId) await this.media.discard(image.mediaId).catch(() => undefined);
  }

  async regenerate(generatedImageId: string): Promise<AiGeneratedImageEntity> {
    const image = await this.requireImage(generatedImageId);
    if (!(await this.repository.resetForRegeneration(generatedImageId))) {
      throw new ConflictError("This image cannot be regenerated right now");
    }
    if (image.mediaId) await this.media.discard(image.mediaId).catch(() => undefined);
    await this.queue.enqueue(generatedImageId).catch(() => undefined); // recovery sweep covers a failed enqueue
    return { ...image, status: "PENDING", mediaId: null, url: null, error: null };
  }

  private async requireImage(id: string): Promise<AiGeneratedImageEntity> {
    const image = await this.repository.findImage(id);
    if (!image) throw new NotFoundError("Generated image not found");
    return image;
  }
}
