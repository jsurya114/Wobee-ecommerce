// Composition root for the ai-images module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): AiImageGeneration, AiGeneratedImage. Reaches other modules only
// through the exported use-cases below (media, products), wrapped as ports.
import { env } from "../../config/env";
import { NotFoundError } from "../../shared/errors";
import { deleteMediaUseCase, getMediaUseCase, uploadMediaUseCase } from "../media/media.module";
import { addProductImageUseCase, getProductAdminUseCase } from "../products/products.module";
import type { ImageGenerationProviderPort } from "./application/ports/image-generation-provider.port";
import type { MediaGatewayPort } from "./application/ports/media-gateway.port";
import type { ProductGatewayPort } from "./application/ports/product-gateway.port";
import { ListGenerationsUseCase } from "./application/use-cases/list-generations.use-case";
import { ProcessGeneratedImageUseCase } from "./application/use-cases/process-generated-image.use-case";
import { RecoverStaleGenerationsUseCase } from "./application/use-cases/recover-stale-generations.use-case";
import { RequestGenerationUseCase } from "./application/use-cases/request-generation.use-case";
import { ReviewGeneratedImageUseCase } from "./application/use-cases/review-generated-image.use-case";
import { ImageProviderError } from "./domain/image-provider.error";
import { FakeImageProvider } from "./infrastructure/providers/fake-image-provider";
import { FashnImageProvider } from "./infrastructure/providers/fashn-image-provider";
import { BullMqGenerationQueue } from "./infrastructure/queues/ai-image.queue";
import { AiImageRepository } from "./infrastructure/repositories/ai-image.repository";
import { AiImagesController } from "./interface/http/ai-images.controller";
import { createAiImagesRouter } from "./interface/http/ai-images.routes";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

const mediaGateway: MediaGatewayPort = {
  getActiveImage: async (mediaId) => {
    const media = await getMediaUseCase.execute(mediaId);
    if (media.status !== "ACTIVE") throw new NotFoundError("Media not found");
    return { id: media.id, url: media.url, mimeType: media.mimeType };
  },
  download: async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new ImageProviderError(`Could not read source image (${response.status})`, response.status >= 500, "SOURCE_DOWNLOAD");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) throw new ImageProviderError("Source image is too large", false, "SOURCE_TOO_LARGE");
    return buffer;
  },
  store: async ({ buffer, mimeType, filename, altText, uploadedByUserId }) => {
    const media = await uploadMediaUseCase.execute({ buffer, originalFilename: filename, mimeType, sizeBytes: buffer.byteLength, altText, uploadedByUserId });
    return { id: media.id, url: media.url };
  },
  discard: (mediaId) => deleteMediaUseCase.execute(mediaId),
};

const productGateway: ProductGatewayPort = {
  getProductName: async (productId) => (await getProductAdminUseCase.execute(productId)).name,
  attachImage: async (productId, url, altText) => {
    await addProductImageUseCase.execute(productId, url, altText);
  },
};

function createProvider(): ImageGenerationProviderPort {
  if (!env.AI_IMAGES_ENABLED) {
    // Never reachable through HTTP (RequestGenerationUseCase refuses first); guards a stray worker job.
    return {
      name: "disabled",
      generate: () => Promise.reject(new ImageProviderError("AI image generation is disabled", false, "DISABLED")),
    };
  }
  if (env.AI_IMAGES_PROVIDER === "fake") return new FakeImageProvider();
  return new FashnImageProvider({ apiKey: env.FASHN_API_KEY!, mode: env.AI_IMAGES_MODE, resolution: env.AI_IMAGES_RESOLUTION });
}

const repository = new AiImageRepository();
const queue = new BullMqGenerationQueue();
const provider = createProvider();

const requestGenerationUseCase = new RequestGenerationUseCase(repository, queue, mediaGateway, productGateway, {
  enabled: env.AI_IMAGES_ENABLED,
  providerName: provider.name,
  dailyLimit: env.AI_IMAGES_DAILY_LIMIT,
});
const listGenerationsUseCase = new ListGenerationsUseCase(repository);
const reviewGeneratedImageUseCase = new ReviewGeneratedImageUseCase(repository, queue, mediaGateway, productGateway);

/** Exported for worker.ts. */
export const processGeneratedImageUseCase = new ProcessGeneratedImageUseCase(repository, provider, mediaGateway);
export const recoverStaleGenerationsUseCase = new RecoverStaleGenerationsUseCase(repository, queue);
export const markGeneratedImageFailedUseCase = { execute: (id: string, message: string) => repository.markFailed(id, message) };

export const router = createAiImagesRouter(new AiImagesController(requestGenerationUseCase, listGenerationsUseCase, reviewGeneratedImageUseCase));
