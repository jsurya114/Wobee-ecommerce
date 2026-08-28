import { ApiError } from "@/lib/api-client";

export interface UploadedMedia {
  id: string;
  url: string;
  altText: string | null;
}

function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_ADMIN_API_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_ADMIN_API_URL is not set — copy apps/admin/.env.example to apps/admin/.env.local.");
  }
  return url;
}

/**
 * The one admin call that isn't plain JSON — `apiFetch` always
 * JSON-stringifies its body, which can't carry a real file. Raw `fetch`
 * with `FormData` instead, letting the browser set its own multipart
 * `Content-Type` boundary (setting it manually here would omit the
 * boundary parameter multer needs to parse the body at all).
 */
export async function uploadMedia(file: File, altText: string, accessToken: string): Promise<UploadedMedia> {
  const formData = new FormData();
  formData.append("file", file);
  if (altText) formData.append("altText", altText);

  const res = await fetch(`${apiBaseUrl()}/api/v1/media`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorBody = (data as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, errorBody?.code ?? "UNKNOWN_ERROR", errorBody?.message ?? "Upload failed");
  }
  return (data as { media: UploadedMedia }).media;
}
