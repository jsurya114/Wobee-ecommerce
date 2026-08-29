import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../../../config/env";
import type { MediaStoragePort, SavedMedia } from "../../application/ports/media-storage.port";

/**
 * Local-disk implementation of MediaStoragePort (week2 (1).md §13's own
 * architecture diagram) — no S3/Cloudinary credentials are approved yet
 * (`DECISIONS_PENDING.md`-style gap, same situation Razorpay was in before
 * Week 1 Day 5's real keys). Rather than a dead "not configured" stub that
 * would make reviews-with-photos/product-media untestable end to end, this
 * is a genuinely working adapter: files land under `MEDIA_UPLOAD_DIR`
 * (default `uploads/`, resolved relative to wherever `apps/api` runs from —
 * true for `pnpm --filter @woobe/api run dev`/`start` and for a container
 * with `apps/api` as its working directory), served back out by
 * `app.ts`'s `express.static` mount at the same path this class's
 * `getUrl()` builds. Swapping in a real S3/Cloudinary class later is a
 * new file implementing this same interface — nothing above this layer
 * changes.
 */
export class LocalDiskMediaStorage implements MediaStoragePort {
  private readonly uploadDir = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);

  async save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<SavedMedia> {
    await mkdir(this.uploadDir, { recursive: true });
    const extension = extensionForMimeType(mimeType) ?? path.extname(originalFilename) ?? "";
    const key = `${randomUUID()}${extension}`;
    await writeFile(path.join(this.uploadDir, key), buffer);
    return { key, url: this.getUrl(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(path.join(this.uploadDir, key));
    } catch (error) {
      // Already gone (e.g. a retried delete) — not an error worth surfacing.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  getUrl(key: string): string {
    return `${env.API_PUBLIC_URL}/uploads/${key}`;
  }
}

function extensionForMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return null;
  }
}
