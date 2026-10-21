import { describe, expect, it } from "vitest";
import { ConflictError, ServiceUnavailableError, TooManyRequestsError, ValidationError } from "../../../../shared/errors";
import { ImageProviderError } from "../../domain/image-provider.error";
import { InMemoryAiImageRepository, fakeMediaGateway, fakeProductGateway } from "../../test-support";
import type { ImageGenerationProviderPort } from "../ports/image-generation-provider.port";
import { ProcessGeneratedImageUseCase } from "./process-generated-image.use-case";
import { RecoverStaleGenerationsUseCase } from "./recover-stale-generations.use-case";
import { RequestGenerationUseCase } from "./request-generation.use-case";
import { ReviewGeneratedImageUseCase } from "./review-generated-image.use-case";

function queueSpy() {
  const enqueued: string[] = [];
  return { enqueued, enqueue: async (id: string) => void enqueued.push(id) };
}
const okProvider: ImageGenerationProviderPort = {
  name: "test",
  generate: async () => ({ image: Buffer.from("result"), mimeType: "image/jpeg", creditsUsed: 2 }),
};
const config = { enabled: true, providerName: "test", dailyLimit: 100 };

async function requested(overrides: Partial<typeof config> = {}, angles: Array<"FRONT" | "BACK" | "SIDE" | "DETAIL"> = ["FRONT", "BACK"]) {
  const repository = new InMemoryAiImageRepository();
  const queue = queueSpy();
  const media = fakeMediaGateway();
  const products = fakeProductGateway();
  const useCase = new RequestGenerationUseCase(repository, queue, media, products, { ...config, ...overrides });
  const generation = await useCase.execute({ productId: "p1", sourceMediaId: "src", angles, requestedByUserId: "u1" });
  return { repository, queue, media, products, generation };
}

describe("RequestGenerationUseCase", () => {
  it("creates one PENDING image per distinct angle and enqueues each", async () => {
    const { generation, queue } = await requested({}, ["FRONT", "FRONT", "BACK"]);
    expect(generation.images.map((i) => i.angle)).toEqual(["FRONT", "BACK"]);
    expect(queue.enqueued).toHaveLength(2);
  });

  it("refuses when the feature is disabled", async () => {
    await expect(requested({ enabled: false })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("refuses when the daily limit would be exceeded", async () => {
    await expect(requested({ dailyLimit: 1 })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("refuses a GIF source", async () => {
    const useCase = new RequestGenerationUseCase(
      new InMemoryAiImageRepository(),
      queueSpy(),
      fakeMediaGateway({ getActiveImage: async (id) => ({ id, url: "u", mimeType: "image/gif" }) }),
      fakeProductGateway(),
      config,
    );
    await expect(useCase.execute({ productId: "p", sourceMediaId: "s", angles: ["FRONT"], requestedByUserId: "u" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("still succeeds when the enqueue fails (the recovery sweep picks the rows up)", async () => {
    const useCase = new RequestGenerationUseCase(new InMemoryAiImageRepository(), { enqueue: () => Promise.reject(new Error("redis down")) }, fakeMediaGateway(), fakeProductGateway(), config);
    const generation = await useCase.execute({ productId: "p", sourceMediaId: "s", angles: ["FRONT"], requestedByUserId: "u" });
    expect(generation.images[0]!.status).toBe("PENDING");
  });
});

describe("ProcessGeneratedImageUseCase", () => {
  it("stores the result and marks the image READY", async () => {
    const { repository, media, generation } = await requested();
    await new ProcessGeneratedImageUseCase(repository, okProvider, media).execute(generation.images[0]!.id);
    const image = repository.images.get(generation.images[0]!.id)!;
    expect(image.status).toBe("READY");
    expect(image.creditsUsed).toBe(2);
    expect(media.stored).toHaveLength(1);
  });

  it("is a no-op for an image that is not PENDING (duplicate job)", async () => {
    const { repository, media, generation } = await requested();
    const useCase = new ProcessGeneratedImageUseCase(repository, okProvider, media);
    await useCase.execute(generation.images[0]!.id);
    await useCase.execute(generation.images[0]!.id);
    expect(media.stored).toHaveLength(1);
  });

  it("marks FAILED without throwing on a non-retryable provider error", async () => {
    const { repository, media, generation } = await requested();
    const provider: ImageGenerationProviderPort = { name: "t", generate: () => Promise.reject(new ImageProviderError("moderated", false, "ContentModerationError")) };
    await new ProcessGeneratedImageUseCase(repository, provider, media).execute(generation.images[0]!.id);
    expect(repository.images.get(generation.images[0]!.id)).toMatchObject({ status: "FAILED", error: "moderated" });
  });

  it("releases the row and rethrows on a retryable error so BullMQ retries", async () => {
    const { repository, media, generation } = await requested();
    const provider: ImageGenerationProviderPort = { name: "t", generate: () => Promise.reject(new ImageProviderError("busy", true)) };
    await expect(new ProcessGeneratedImageUseCase(repository, provider, media).execute(generation.images[0]!.id)).rejects.toThrow("busy");
    expect(repository.images.get(generation.images[0]!.id)!.status).toBe("PENDING");
  });

  it("fails permanently when the source media is gone", async () => {
    const { repository, generation } = await requested();
    const media = fakeMediaGateway({ getActiveImage: () => Promise.reject(new Error("gone")) });
    await new ProcessGeneratedImageUseCase(repository, okProvider, media).execute(generation.images[0]!.id);
    expect(repository.images.get(generation.images[0]!.id)!.status).toBe("FAILED");
  });
});

describe("ReviewGeneratedImageUseCase", () => {
  async function ready() {
    const ctx = await requested();
    const id = ctx.generation.images[0]!.id;
    await new ProcessGeneratedImageUseCase(ctx.repository, okProvider, ctx.media).execute(id);
    const review = new ReviewGeneratedImageUseCase(ctx.repository, ctx.queue, ctx.media, ctx.products);
    return { ...ctx, id, review };
  }

  it("approve attaches the image to the product exactly once", async () => {
    const { review, id, products, repository } = await ready();
    await review.approve(id);
    expect(products.attached).toEqual([{ productId: "p1", url: "http://cdn/m1", altText: "Linen Shirt – front view" }]);
    expect(repository.images.get(id)!.status).toBe("APPROVED");
    await expect(review.approve(id)).rejects.toBeInstanceOf(ConflictError);
    expect(products.attached).toHaveLength(1);
  });

  it("approve reverts to READY if attaching to the product fails", async () => {
    const ctx = await ready();
    const review = new ReviewGeneratedImageUseCase(ctx.repository, ctx.queue, ctx.media, fakeProductGateway({ attachImage: () => Promise.reject(new Error("db")) }));
    await expect(review.approve(ctx.id)).rejects.toThrow("db");
    expect(ctx.repository.images.get(ctx.id)!.status).toBe("READY");
  });

  it("reject discards the stored file", async () => {
    const { review, id, media, repository } = await ready();
    await review.reject(id);
    expect(repository.images.get(id)!.status).toBe("REJECTED");
    expect(media.discarded).toEqual(["m1"]);
  });

  it("regenerate re-queues, clears the old result and discards its file", async () => {
    const { review, id, media, queue, repository } = await ready();
    const before = queue.enqueued.length;
    await review.regenerate(id);
    expect(repository.images.get(id)).toMatchObject({ status: "PENDING", mediaId: null });
    expect(media.discarded).toEqual(["m1"]);
    expect(queue.enqueued.length).toBe(before + 1);
  });

  it("cannot regenerate an image that is still processing", async () => {
    const { repository, queue, media, products, generation } = await requested();
    const review = new ReviewGeneratedImageUseCase(repository, queue, media, products);
    await expect(review.regenerate(generation.images[0]!.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("RecoverStaleGenerationsUseCase", () => {
  it("re-enqueues stranded rows", async () => {
    const { repository, generation } = await requested();
    await repository.claimForProcessing(generation.images[0]!.id); // crashed mid-flight
    const queue = queueSpy();
    expect(await new RecoverStaleGenerationsUseCase(repository, queue).execute()).toBe(2);
    expect(repository.images.get(generation.images[0]!.id)!.status).toBe("PENDING");
    expect(queue.enqueued).toHaveLength(2);
  });
});
