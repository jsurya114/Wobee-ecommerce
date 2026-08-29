/**
 * Pure, dependency-free (week2 (1).md §13's "File validation" bullet) —
 * no I/O, so it's unit-testable without a real file or a running server.
 *
 * Only IMAGE is approved this week (see schema.prisma's MediaType enum
 * comment) — jpeg/png/webp cover every product/variant/collection photo
 * this catalogue actually needs; gif/video/360 have no approved consumer
 * yet, so their mime types are deliberately not in this allowlist.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — generous for a product photo, small enough to reject an obviously-wrong upload.

export interface UploadValidationResult {
  ok: boolean;
  error?: string;
}

export function validateUpload(mimeType: string, sizeBytes: number): UploadValidationResult {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, error: `Unsupported file type "${mimeType}" — only JPEG, PNG, or WebP images are allowed` };
  }
  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: `File is too large — maximum size is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB` };
  }
  return { ok: true };
}
