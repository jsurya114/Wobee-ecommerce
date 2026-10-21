import type { AiGeneratedImageEntity, AiGenerationEntity, AiImageAngle } from "../../domain/ai-image";

export interface CreateGenerationInput {
  productId: string;
  sourceMediaId: string;
  createdByUserId: string;
  provider: string;
  angles: AiImageAngle[];
}

export interface MarkReadyInput {
  mediaId: string;
  predictionId?: string;
  creditsUsed?: number;
}

/** ADR-010: only the repository implementation imports @woobe/database. */
export interface AiImageRepositoryPort {
  createGeneration(input: CreateGenerationInput): Promise<AiGenerationEntity>;
  listForProduct(productId: string): Promise<AiGenerationEntity[]>;
  findImage(id: string): Promise<AiGeneratedImageEntity | null>;
  findSource(generatedImageId: string): Promise<{ sourceMediaId: string; createdByUserId: string } | null>;
  /** Atomically PENDING|FAILED -> PROCESSING (and bumps attempts); false if some other worker/state got there first. */
  claimForProcessing(id: string): Promise<boolean>;
  /** PROCESSING -> PENDING so a retry (or the recovery sweep) can claim it again. */
  releaseForRetry(id: string): Promise<void>;
  markReady(id: string, input: MarkReadyInput): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** READY -> APPROVED | REJECTED. false when the image was not READY. */
  settleReady(id: string, status: "APPROVED" | "REJECTED"): Promise<boolean>;
  /** APPROVED -> READY, undoing an approval whose product-attach step failed. */
  reopenApproved(id: string): Promise<void>;
  /** FAILED|REJECTED|READY -> PENDING, clearing the previous result. false when not in one of those states. */
  resetForRegeneration(id: string): Promise<boolean>;
  countImagesRequestedSince(since: Date): Promise<number>;
  /** PENDING/PROCESSING images untouched since `before` — used to recover jobs lost to a Redis flush or crash. */
  findStaleImageIds(before: Date): Promise<string[]>;
}
