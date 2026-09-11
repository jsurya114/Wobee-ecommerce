/**
 * Deliberately duplicated from media/domain/validate-upload.ts rather than
 * imported across the module boundary — same "separate literal, not a
 * shared cross-module reach-in" precedent home.module.ts's own
 * CURATED_CLOTHING_SIZES comment already established for this codebase:
 * cross-module communication goes through composed ports (see
 * testimonials.module.ts's MediaUploaderPort), never a direct import of
 * another module's internal domain file. Same allowlist/size cap as
 * media's own — if one changes, the other must be updated to match.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_TESTIMONIAL_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, same cap as media's own.

export const MAX_TESTIMONIAL_IMAGES = 3;

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

export function validateTestimonialImage(mimeType: string, sizeBytes: number): ImageValidationResult {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, error: `Unsupported file type "${mimeType}" — only JPEG, PNG, or WebP images are allowed` };
  }
  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (sizeBytes > MAX_TESTIMONIAL_IMAGE_BYTES) {
    return { ok: false, error: `File is too large — maximum size is ${MAX_TESTIMONIAL_IMAGE_BYTES / (1024 * 1024)}MB` };
  }
  return { ok: true };
}
