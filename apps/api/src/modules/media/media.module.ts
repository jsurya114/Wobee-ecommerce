// Composition root for the media module (ARCHITECTURE.md §3.2). New module,
// not a Week 1 placeholder — week2 (1).md §13 adds it fresh. Owns
// (ADR-010): Media. No other module's write path touches this table.
//
// Week 2 Day 4 (week2 (1).md §13 — Media Management). Admin-only surface
// this week (§13's own "Admin uploads" bullet) — a customer-facing upload
// path (e.g. review photos) is deliberately not built, see reviews.module.ts.
import { DeleteMediaUseCase } from "./application/use-cases/delete-media.use-case";
import { GetMediaUseCase } from "./application/use-cases/get-media.use-case";
import { UploadMediaUseCase } from "./application/use-cases/upload-media.use-case";
import { MediaRepository } from "./infrastructure/repositories/media.repository";
import { LocalDiskMediaStorage } from "./infrastructure/storage/local-disk-media-storage.service";
import { MediaController } from "./interface/http/media.controller";
import { createMediaRouter } from "./interface/http/media.routes";

const mediaRepository = new MediaRepository();
const mediaStorage = new LocalDiskMediaStorage();

const uploadMediaUseCase = new UploadMediaUseCase(mediaStorage, mediaRepository);
const getMediaUseCase = new GetMediaUseCase(mediaRepository);
const deleteMediaUseCase = new DeleteMediaUseCase(mediaStorage, mediaRepository);

const mediaController = new MediaController(uploadMediaUseCase, getMediaUseCase, deleteMediaUseCase);

export const router = createMediaRouter(mediaController);
