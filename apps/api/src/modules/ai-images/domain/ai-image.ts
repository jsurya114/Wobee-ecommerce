export const AI_IMAGE_ANGLES = ["FRONT", "BACK", "SIDE", "DETAIL"] as const;
export type AiImageAngle = (typeof AI_IMAGE_ANGLES)[number];

export type AiGeneratedImageStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "APPROVED" | "REJECTED";

export interface AiGeneratedImageEntity {
  id: string;
  generationId: string;
  productId: string;
  angle: AiImageAngle;
  status: AiGeneratedImageStatus;
  mediaId: string | null;
  url: string | null;
  creditsUsed: number | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiGenerationEntity {
  id: string;
  productId: string;
  sourceMediaId: string;
  sourceUrl: string;
  createdByUserId: string;
  provider: string;
  createdAt: Date;
  images: AiGeneratedImageEntity[];
}

/**
 * Per-angle styling instructions appended to the provider call. The provider
 * (FASHN product-to-model) has no explicit camera parameter, so the angle is
 * steered purely by prompt — fidelity per angle is verified in the Phase 0
 * spike before this is relied on. Each prompt restates the "keep the garment
 * identical" constraint because that is the failure clients care about most.
 */
const KEEP_GARMENT = "Keep the garment exactly as in the product photo: same colour, print, logo, fabric and cut. Plain studio background, soft even lighting, e-commerce catalogue photo.";

export const ANGLE_PROMPTS: Record<AiImageAngle, string> = {
  FRONT: `Full-length front view of the model standing straight, facing the camera. ${KEEP_GARMENT}`,
  BACK: `Full-length back view: the model faces away from the camera so the back of the garment is visible. ${KEEP_GARMENT}`,
  SIDE: `Full-length side profile view: the model is turned 90 degrees to the camera. ${KEEP_GARMENT}`,
  DETAIL: `Close-up three-quarter crop of the torso showing the garment's fabric, stitching and neckline details. ${KEEP_GARMENT}`,
};
