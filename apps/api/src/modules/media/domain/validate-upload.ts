/**
 * Pure, dependency-free (week2 (1).md §13's "File validation" bullet) —
 * no I/O, so it's unit-testable without a real file or a running server.
 *
 * Only IMAGE is approved (see schema.prisma's MediaType enum comment).
 * jpeg/png/webp cover product/variant/collection photos; image/gif was added
 * 2026-09-28 for animated homepage banners (still an IMAGE — no new MediaType).
 * video/360 still have no approved consumer. This allowlist governs the
 * ADMIN upload endpoint only — customer testimonial photos keep their own,
 * stricter validator (testimonials/domain/validate-testimonial-image.ts).
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/**
 * 10MB (was 5MB) — animated GIF banners are routinely 5-10MB. NOTE: in
 * production nginx in front of the API caps request bodies at 6MB
 * (infra/terraform/modules/ec2/templates/nginx/api.conf.tpl), so files over
 * ~6MB are refused there with 413 until that cap is raised — see
 * docs/deployment.md "Raising the upload size limit" for why that is a manual
 * step and not a template edit.
 */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export interface UploadValidationResult {
  ok: boolean;
  error?: string;
}

export function validateUpload(mimeType: string, sizeBytes: number): UploadValidationResult {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, error: `Unsupported file type "${mimeType}" — only JPEG, PNG, WebP, or GIF images are allowed` };
  }
  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: `File is too large — maximum size is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB` };
  }
  return { ok: true };
}
