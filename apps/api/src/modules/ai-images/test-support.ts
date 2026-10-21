import type { AiImageRepositoryPort, CreateGenerationInput, MarkReadyInput } from "./application/ports/ai-image-repository.port";
import type { MediaGatewayPort } from "./application/ports/media-gateway.port";
import type { ProductGatewayPort } from "./application/ports/product-gateway.port";
import type { AiGeneratedImageEntity, AiGenerationEntity } from "./domain/ai-image";

/** In-memory fakes shared by the use-case unit tests (no Postgres/Redis/S3). */
export class InMemoryAiImageRepository implements AiImageRepositoryPort {
  images = new Map<string, AiGeneratedImageEntity>();
  generations = new Map<string, AiGenerationEntity>();
  private seq = 0;

  async createGeneration(input: CreateGenerationInput): Promise<AiGenerationEntity> {
    const generationId = `g${++this.seq}`;
    const now = new Date();
    const images = input.angles.map((angle): AiGeneratedImageEntity => {
      const image = {
        id: `i${++this.seq}`, generationId, productId: input.productId, angle, status: "PENDING" as const, mediaId: null, url: null,
        creditsUsed: null, error: null, attempts: 0, createdAt: now, updatedAt: now,
      };
      this.images.set(image.id, image);
      return image;
    });
    const generation = { id: generationId, productId: input.productId, sourceMediaId: input.sourceMediaId, sourceUrl: "http://src", createdByUserId: input.createdByUserId, provider: input.provider, createdAt: now, images };
    this.generations.set(generationId, generation);
    return generation;
  }
  async listForProduct(productId: string) {
    return [...this.generations.values()].filter((g) => g.productId === productId);
  }
  async findImage(id: string) {
    const image = this.images.get(id);
    return image ? { ...image } : null; // a copy, like a real DB read — later updates must not alter it
  }
  async findSource(id: string) {
    const image = this.images.get(id);
    const generation = image && this.generations.get(image.generationId);
    return generation ? { sourceMediaId: generation.sourceMediaId, createdByUserId: generation.createdByUserId } : null;
  }
  private patch(id: string, from: string[], to: Partial<AiGeneratedImageEntity>): boolean {
    const image = this.images.get(id);
    if (!image || !from.includes(image.status)) return false;
    Object.assign(image, to);
    return true;
  }
  async claimForProcessing(id: string) {
    const image = this.images.get(id);
    return this.patch(id, ["PENDING"], { status: "PROCESSING", attempts: (image?.attempts ?? 0) + 1 });
  }
  async releaseForRetry(id: string) {
    this.patch(id, ["PROCESSING"], { status: "PENDING" });
  }
  async markReady(id: string, input: MarkReadyInput) {
    this.patch(id, ["PROCESSING"], { status: "READY", mediaId: input.mediaId, url: `http://cdn/${input.mediaId}`, creditsUsed: input.creditsUsed ?? null });
  }
  async markFailed(id: string, error: string) {
    this.patch(id, ["PENDING", "PROCESSING"], { status: "FAILED", error });
  }
  async settleReady(id: string, status: "APPROVED" | "REJECTED") {
    return this.patch(id, ["READY"], status === "REJECTED" ? { status, mediaId: null, url: null } : { status });
  }
  async reopenApproved(id: string) {
    this.patch(id, ["APPROVED"], { status: "READY" });
  }
  async resetForRegeneration(id: string) {
    return this.patch(id, ["FAILED", "REJECTED", "READY"], { status: "PENDING", mediaId: null, url: null, error: null });
  }
  async countImagesRequestedSince() {
    return this.images.size;
  }
  async findStaleImageIds() {
    return [...this.images.values()].filter((i) => i.status === "PENDING" || i.status === "PROCESSING").map((i) => i.id);
  }
}

export function fakeMediaGateway(overrides: Partial<MediaGatewayPort> = {}): MediaGatewayPort & { stored: string[]; discarded: string[] } {
  const stored: string[] = [];
  const discarded: string[] = [];
  return {
    stored,
    discarded,
    getActiveImage: async (id) => ({ id, url: `http://src/${id}`, mimeType: "image/jpeg" }),
    download: async () => Buffer.from("garment"),
    store: async () => {
      const id = `m${stored.length + 1}`;
      stored.push(id);
      return { id, url: `http://cdn/${id}` };
    },
    discard: async (id) => {
      discarded.push(id);
    },
    ...overrides,
  };
}

export function fakeProductGateway(overrides: Partial<ProductGatewayPort> = {}): ProductGatewayPort & { attached: Array<{ productId: string; url: string; altText: string }> } {
  const attached: Array<{ productId: string; url: string; altText: string }> = [];
  return {
    attached,
    getProductName: async () => "Linen Shirt",
    attachImage: async (productId, url, altText) => {
      attached.push({ productId, url, altText });
    },
    ...overrides,
  };
}
