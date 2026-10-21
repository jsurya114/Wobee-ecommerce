import { apiFetch } from "@/lib/api-client";

export type AiImageAngle = "FRONT" | "BACK" | "SIDE" | "DETAIL";
export type AiGeneratedImageStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "APPROVED" | "REJECTED";

export const AI_IMAGE_ANGLES: AiImageAngle[] = ["FRONT", "BACK", "SIDE", "DETAIL"];

export interface AiGeneratedImage {
  id: string;
  angle: AiImageAngle;
  status: AiGeneratedImageStatus;
  url: string | null;
  error: string | null;
}

export interface AiGeneration {
  id: string;
  sourceUrl: string;
  createdAt: string;
  images: AiGeneratedImage[];
}

export function requestAiImages(productId: string, sourceMediaId: string, angles: AiImageAngle[], accessToken: string): Promise<{ generation: AiGeneration }> {
  return apiFetch(`/api/v1/ai-images/products/${productId}`, { method: "POST", body: { sourceMediaId, angles }, accessToken });
}

export function listAiGenerations(productId: string, accessToken: string): Promise<{ generations: AiGeneration[] }> {
  return apiFetch(`/api/v1/ai-images/products/${productId}`, { accessToken });
}

export function approveAiImage(id: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/ai-images/images/${id}/approve`, { method: "POST", accessToken });
}

export function rejectAiImage(id: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/ai-images/images/${id}/reject`, { method: "POST", accessToken });
}

export function regenerateAiImage(id: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/ai-images/images/${id}/regenerate`, { method: "POST", accessToken });
}
