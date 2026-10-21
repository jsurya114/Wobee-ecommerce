import { logError } from "../../../../shared/logger";
import { ANGLE_PROMPTS } from "../../domain/ai-image";
import { ImageProviderError } from "../../domain/image-provider.error";
import type { AiImageRepositoryPort } from "../ports/ai-image-repository.port";
import type { ImageGenerationProviderPort } from "../ports/image-generation-provider.port";
import type { MediaGatewayPort } from "../ports/media-gateway.port";

const EXTENSION_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Worker-side. Returns normally for non-retryable provider failures (the row
 * is marked FAILED and nothing more can help); throws for retryable ones so
 * BullMQ's attempts/backoff runs, after releasing the row for the next claim.
 */
export class ProcessGeneratedImageUseCase {
  constructor(
    private readonly repository: AiImageRepositoryPort,
    private readonly provider: ImageGenerationProviderPort,
    private readonly media: MediaGatewayPort,
  ) {}

  async execute(generatedImageId: string): Promise<void> {
    const image = await this.repository.findImage(generatedImageId);
    if (!image) return;
    if (!(await this.repository.claimForProcessing(generatedImageId))) return; // already handled / being handled

    let storedMediaId: string | undefined;
    try {
      const origin = await this.repository.findSource(generatedImageId);
      if (!origin) throw new ImageProviderError("Generation no longer exists", false, "SOURCE_MISSING");
      const source = await this.media.getActiveImage(origin.sourceMediaId).catch(() => {
        throw new ImageProviderError("Source image no longer available", false, "SOURCE_MISSING");
      });

      const sourceImage = await this.media.download(source.url);
      const result = await this.provider.generate({
        sourceImage,
        sourceMimeType: source.mimeType,
        angle: image.angle,
        prompt: ANGLE_PROMPTS[image.angle],
      });

      const stored = await this.media.store({
        buffer: result.image,
        mimeType: result.mimeType,
        filename: `ai-${image.angle.toLowerCase()}.${EXTENSION_BY_MIME[result.mimeType] ?? "png"}`,
        altText: `AI generated ${image.angle.toLowerCase()} view`,
        uploadedByUserId: origin.createdByUserId,
      });
      storedMediaId = stored.id;
      await this.repository.markReady(generatedImageId, { mediaId: stored.id, predictionId: result.predictionId, creditsUsed: result.creditsUsed });
    } catch (error) {
      if (storedMediaId) await this.media.discard(storedMediaId).catch(() => undefined);
      const retryable = error instanceof ImageProviderError ? error.retryable : true;
      logError("ai_image_generation_failed", {
        generated_image_id: generatedImageId,
        angle: image.angle,
        code: error instanceof ImageProviderError ? error.code : "UNEXPECTED",
        retryable,
        message: error instanceof Error ? error.message : String(error),
      });
      if (retryable) {
        await this.repository.releaseForRetry(generatedImageId);
        throw error;
      }
      await this.repository.markFailed(generatedImageId, error instanceof Error ? error.message : "Generation failed");
    }
  }
}
