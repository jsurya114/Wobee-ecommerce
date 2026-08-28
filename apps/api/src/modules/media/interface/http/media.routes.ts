import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer, { MulterError } from "multer";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { ValidationError } from "../../../../shared/errors";
import { PERMISSIONS } from "../../../../config/permissions";
import { MAX_UPLOAD_SIZE_BYTES } from "../../domain/validate-upload";
import type { MediaController } from "./media.controller";

// memoryStorage, not diskStorage — UploadMediaUseCase/LocalDiskMediaStorage
// own where bytes actually land (this route shouldn't know or care that
// today's adapter happens to be local disk). `limits.fileSize` rejects an
// oversized upload while multer is still streaming it in, before this
// module's own validateUpload() would even run.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } });

/**
 * multer calls `next(err)` with its own `MulterError` (callback-style, not
 * a Promise `asyncHandler` would catch) — left unmapped, that error isn't a
 * `DomainError` and falls through error-handler.ts's generic branch as an
 * opaque 500, not the clean 400 an oversized/malformed upload should be.
 */
function handleUploadErrors(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError) {
      next(new ValidationError(err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message));
      return;
    }
    next(err);
  });
}

/** Admin-only (week2 (1).md §13's "Admin uploads") — no customer-facing upload surface exists yet (review photos were deliberately deferred, see reviews module's own doc comment). */
export function createMediaRouter(controller: MediaController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_CATALOG));

  router.post("/", handleUploadErrors, asyncHandler((req, res) => controller.upload(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.get(req, res)));
  router.delete("/:id", asyncHandler((req, res) => controller.remove(req, res)));

  return router;
}
