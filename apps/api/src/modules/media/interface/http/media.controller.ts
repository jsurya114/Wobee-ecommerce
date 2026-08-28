import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { DeleteMediaUseCase } from "../../application/use-cases/delete-media.use-case";
import type { GetMediaUseCase } from "../../application/use-cases/get-media.use-case";
import type { UploadMediaUseCase } from "../../application/use-cases/upload-media.use-case";

/** Controllers stay thin. Every route here is admin-permission-gated (media.routes.ts) — req.user is guaranteed. */
export class MediaController {
  constructor(
    private readonly uploadMediaUseCase: UploadMediaUseCase,
    private readonly getMediaUseCase: GetMediaUseCase,
    private readonly deleteMediaUseCase: DeleteMediaUseCase,
  ) {}

  async upload(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new ValidationError("No file uploaded — send it as multipart/form-data under the field name \"file\"");
    }
    const altText = typeof req.body?.altText === "string" ? req.body.altText : undefined;
    const media = await this.uploadMediaUseCase.execute({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      altText,
      uploadedByUserId: req.user!.id,
    });
    res.status(201).json({ media });
  }

  async get(req: Request, res: Response): Promise<void> {
    const media = await this.getMediaUseCase.execute(requireMediaId(req));
    res.status(200).json({ media });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.deleteMediaUseCase.execute(requireMediaId(req));
    res.status(204).send();
  }
}

function requireMediaId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Media id is required");
  }
  return id;
}
