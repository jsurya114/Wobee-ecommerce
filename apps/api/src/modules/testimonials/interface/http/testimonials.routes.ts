import { submitTestimonialSchema } from "@woobe/validation";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer, { MulterError } from "multer";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { rateLimit } from "../../../../middleware/rate-limit";
import { validate } from "../../../../middleware/validate";
import { ValidationError } from "../../../../shared/errors";
import { MAX_TESTIMONIAL_IMAGES, MAX_TESTIMONIAL_IMAGE_BYTES } from "../../domain/validate-testimonial-image";
import type { TestimonialsController } from "./testimonials.controller";

// memoryStorage — same reasoning as media.routes.ts's own upload config:
// UploadMediaUseCase/MediaStoragePort own where bytes actually land, this
// route shouldn't know or care. `limits` rejects an oversized upload or a
// 4th file while multer is still streaming the body in, before this
// module's own validateTestimonialImage() would even run.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TESTIMONIAL_IMAGE_BYTES, files: MAX_TESTIMONIAL_IMAGES },
});

/** Same MulterError-isn't-a-DomainError mapping as media.routes.ts's own handleUploadErrors. */
function handleUploadErrors(req: Request, res: Response, next: NextFunction): void {
  upload.array("images", MAX_TESTIMONIAL_IMAGES)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File is too large"
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
            ? `You can attach at most ${MAX_TESTIMONIAL_IMAGES} photos`
            : err.message;
      next(new ValidationError(message));
      return;
    }
    next(err);
  });
}

/**
 * Every route here requires a real customer session — there is no
 * anonymous testimonial submission or public write path (2026-09-11
 * design's "Verified Customer" rule: identity/ownership/delivered-status
 * are only ever derived server-side from the authenticated session + the
 * order it's checked against, never from anything the client sends).
 */
export function createTestimonialsRouter(controller: TestimonialsController): Router {
  const router = Router();

  router.post(
    "/",
    authGuard,
    // Defense in depth alongside the real eligibility guard (delivered +
    // ownership + the DB's own one-per-order uniqueness) — a rate limit
    // can't distinguish a legitimate retry from abuse, so it's generous:
    // an active customer with several delivered orders in one sitting, or
    // a client retrying after a transient error, must not get 429'd by
    // this before the real eligibility rule (one per order) ever runs.
    rateLimit({ keyPrefix: "testimonials-submit", max: 30, windowSeconds: 60 * 60 }),
    handleUploadErrors,
    validate(submitTestimonialSchema),
    asyncHandler((req, res) => controller.submit(req, res)),
  );
  router.get("/by-order/:orderId", authGuard, asyncHandler((req, res) => controller.myTestimonialForOrder(req, res)));

  return router;
}
