import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Storage keys are a fresh UUID plus an extension, minted once per upload and
 * never reused or overwritten — so every media URL is content-immutable, which
 * is what makes a year-long immutable cache lifetime safe (both the local
 * `/uploads` mount and S3/CloudFront delivery rely on it). Shared by every
 * MediaStoragePort implementation so the key shape cannot drift between them.
 */
export function generateMediaKey(originalFilename: string, mimeType: string): string {
  const extension = extensionForMimeType(mimeType) ?? path.extname(originalFilename) ?? "";
  return `${randomUUID()}${extension}`;
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
