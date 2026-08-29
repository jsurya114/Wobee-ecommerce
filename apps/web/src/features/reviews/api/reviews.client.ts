import type { SubmitReviewInput, UpdateReviewInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN";
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RatingSummary {
  averageRating: number;
  reviewCount: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ListReviewsResult {
  items: Review[];
  total: number;
  page: number;
  pageSize: number;
  ratingSummary: RatingSummary;
}

export function listReviews(productId: string, page = 1, pageSize = 10): Promise<ListReviewsResult> {
  return apiFetch<ListReviewsResult>(`/api/v1/reviews?productId=${encodeURIComponent(productId)}&page=${page}&pageSize=${pageSize}`);
}

export function submitReview(input: SubmitReviewInput, accessToken: string): Promise<{ review: Review }> {
  return apiFetch<{ review: Review }>("/api/v1/reviews", { method: "POST", body: input, accessToken });
}

export function updateReview(id: string, input: UpdateReviewInput, accessToken: string): Promise<{ review: Review }> {
  return apiFetch<{ review: Review }>(`/api/v1/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body: input, accessToken });
}

export function deleteReview(id: string, accessToken: string): Promise<void> {
  return apiFetch<void>(`/api/v1/reviews/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
}
