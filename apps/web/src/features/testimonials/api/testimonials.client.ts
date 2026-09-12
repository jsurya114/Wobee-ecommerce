import { ApiError, apiFetch } from "@/lib/api-client";

/**
 * Deliberately just `{ exists: boolean }` — the customer must never learn
 * whether their testimonial is PENDING/APPROVED/REJECTED (2026-09-11
 * design's central anti-abuse rule). The API itself never returns a status
 * field on this endpoint; this type reflects that on purpose, not an
 * omission.
 */
export function getMyTestimonialForOrder(orderId: string, accessToken: string): Promise<{ exists: boolean }> {
  return apiFetch<{ exists: boolean }>(`/api/v1/testimonials/by-order/${encodeURIComponent(orderId)}`, { accessToken });
}

function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set — copy apps/web/.env.example to apps/web/.env.local (see comment there for why root .env isn't enough).",
    );
  }
  return url;
}

/**
 * The one testimonials call that isn't plain JSON — same reasoning
 * apps/admin's `admin-media.client.ts` already documents: raw `fetch` with
 * `FormData` so the browser sets its own multipart boundary, carrying
 * rating/text alongside up to 3 real image files in a single request (the
 * whole submission is atomic — see SubmitTestimonialUseCase's own doc
 * comment for why there's no separate "upload photos" step).
 */
export async function submitTestimonial(
  input: { orderId: string; rating: number; text: string; images: File[] },
  accessToken: string,
): Promise<{ message: string }> {
  const formData = new FormData();
  formData.append("orderId", input.orderId);
  formData.append("rating", String(input.rating));
  formData.append("text", input.text);
  for (const image of input.images) {
    formData.append("images", image);
  }

  const res = await fetch(`${apiBaseUrl()}/api/v1/testimonials`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorBody = (data as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } })?.error;
    throw new ApiError(res.status, errorBody?.code ?? "UNKNOWN_ERROR", errorBody?.message ?? "Something went wrong", errorBody?.fieldErrors);
  }
  return data as { message: string };
}
