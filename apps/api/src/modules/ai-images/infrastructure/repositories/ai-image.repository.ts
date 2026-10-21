import { prisma } from "@woobe/database";
import type { Prisma } from "@woobe/database";
import type { AiImageRepositoryPort, CreateGenerationInput, MarkReadyInput } from "../../application/ports/ai-image-repository.port";
import type { AiGeneratedImageEntity, AiGenerationEntity } from "../../domain/ai-image";

const IMAGE_INCLUDE = { media: { select: { url: true } }, generation: { select: { productId: true } } } as const;

type ImageRow = Prisma.AiGeneratedImageGetPayload<{ include: typeof IMAGE_INCLUDE }>;

function toImage(row: ImageRow): AiGeneratedImageEntity {
  return {
    id: row.id,
    generationId: row.generationId,
    productId: row.generation.productId,
    angle: row.angle,
    status: row.status,
    mediaId: row.mediaId,
    url: row.media?.url ?? null,
    creditsUsed: row.creditsUsed,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const GENERATION_INCLUDE = {
  source: { select: { url: true } },
  images: { include: IMAGE_INCLUDE, orderBy: { createdAt: "asc" } },
} as const satisfies Prisma.AiImageGenerationInclude;

type GenerationRow = Prisma.AiImageGenerationGetPayload<{ include: typeof GENERATION_INCLUDE }>;

function toGeneration(row: GenerationRow): AiGenerationEntity {
  return {
    id: row.id,
    productId: row.productId,
    sourceMediaId: row.sourceMediaId,
    sourceUrl: row.source.url,
    createdByUserId: row.createdByUserId,
    provider: row.provider,
    createdAt: row.createdAt,
    images: row.images.map(toImage),
  };
}

/** ADR-010: the ONLY file in the ai-images module allowed to import @woobe/database. */
export class AiImageRepository implements AiImageRepositoryPort {
  async createGeneration(input: CreateGenerationInput): Promise<AiGenerationEntity> {
    const row = await prisma.aiImageGeneration.create({
      data: {
        productId: input.productId,
        sourceMediaId: input.sourceMediaId,
        createdByUserId: input.createdByUserId,
        provider: input.provider,
        images: { create: input.angles.map((angle) => ({ angle })) },
      },
      include: GENERATION_INCLUDE,
    });
    return toGeneration(row);
  }

  async listForProduct(productId: string): Promise<AiGenerationEntity[]> {
    const rows = await prisma.aiImageGeneration.findMany({
      where: { productId },
      include: GENERATION_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.map(toGeneration);
  }

  async findImage(id: string): Promise<AiGeneratedImageEntity | null> {
    const row = await prisma.aiGeneratedImage.findUnique({ where: { id }, include: IMAGE_INCLUDE });
    return row ? toImage(row) : null;
  }

  async findSource(generatedImageId: string): Promise<{ sourceMediaId: string; createdByUserId: string } | null> {
    const row = await prisma.aiGeneratedImage.findUnique({
      where: { id: generatedImageId },
      select: { generation: { select: { sourceMediaId: true, createdByUserId: true } } },
    });
    return row?.generation ?? null;
  }

  async claimForProcessing(id: string): Promise<boolean> {
    const { count } = await prisma.aiGeneratedImage.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PROCESSING", error: null, attempts: { increment: 1 } },
    });
    return count === 1;
  }

  async releaseForRetry(id: string): Promise<void> {
    await prisma.aiGeneratedImage.updateMany({ where: { id, status: "PROCESSING" }, data: { status: "PENDING" } });
  }

  async markReady(id: string, input: MarkReadyInput): Promise<void> {
    await prisma.aiGeneratedImage.update({
      where: { id },
      data: { status: "READY", mediaId: input.mediaId, providerPredictionId: input.predictionId ?? null, creditsUsed: input.creditsUsed ?? null, error: null },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await prisma.aiGeneratedImage.update({ where: { id }, data: { status: "FAILED", error: error.slice(0, 500) } });
  }

  async settleReady(id: string, status: "APPROVED" | "REJECTED"): Promise<boolean> {
    const { count } = await prisma.aiGeneratedImage.updateMany({
      where: { id, status: "READY" },
      // A rejected image's file is discarded by the use-case, so drop the dangling reference.
      data: status === "REJECTED" ? { status, mediaId: null } : { status },
    });
    return count === 1;
  }

  async reopenApproved(id: string): Promise<void> {
    await prisma.aiGeneratedImage.updateMany({ where: { id, status: "APPROVED" }, data: { status: "READY" } });
  }

  async resetForRegeneration(id: string): Promise<boolean> {
    const { count } = await prisma.aiGeneratedImage.updateMany({
      where: { id, status: { in: ["FAILED", "REJECTED", "READY"] } },
      data: { status: "PENDING", mediaId: null, error: null, providerPredictionId: null, creditsUsed: null },
    });
    return count === 1;
  }

  countImagesRequestedSince(since: Date): Promise<number> {
    return prisma.aiGeneratedImage.count({ where: { createdAt: { gte: since } } });
  }

  async findStaleImageIds(before: Date): Promise<string[]> {
    const rows = await prisma.aiGeneratedImage.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] }, updatedAt: { lt: before } },
      select: { id: true },
      take: 200,
    });
    return rows.map((r) => r.id);
  }
}
