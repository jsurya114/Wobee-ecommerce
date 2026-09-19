/**
 * Provider-independent storage abstraction (week2 (1).md §13's own
 * architecture diagram: `Application -> MediaStorage interface ->
 * S3/Cloudinary implementation`). Two implementations exist:
 * `S3MediaStorage` (production: private S3 bucket, CloudFront URLs) and
 * `LocalDiskMediaStorage` (local dev/tests). `createMediaStorage` picks one
 * from configuration; nothing in `application` or `interface` knows which.
 */
export interface SavedMedia {
  /** Storage-layer key — a filename under the upload dir locally, an S3 object key in production. Never exposed to a client directly. */
  key: string;
  /** A URL a browser can load directly (a CloudFront URL in production — never an S3 URL). */
  url: string;
}

export interface MediaStoragePort {
  save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<SavedMedia>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
