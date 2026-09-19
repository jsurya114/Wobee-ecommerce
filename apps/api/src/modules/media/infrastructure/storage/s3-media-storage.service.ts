import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { logError } from "../../../../shared/logger";
import type { MediaStoragePort, SavedMedia } from "../../application/ports/media-storage.port";
import { generateMediaKey } from "./media-key";

/** The one method of S3Client this adapter uses — lets tests inject a fake with no AWS SDK network, credentials, or mocking library. */
export interface S3CommandSender {
  send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3MediaStorageConfig {
  client: S3CommandSender;
  bucket: string;
  /** CloudFront origin the browser loads media from, e.g. https://dxxxx.cloudfront.net (no bucket URL is ever handed out). */
  publicBaseUrl: string;
}

/** Keys are unique per upload and never overwritten, so the object is immutable for its whole life. */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * S3 implementation of MediaStoragePort. The bucket is PRIVATE (Block Public
 * Access on, no public policy, ACLs disabled): this class only writes and
 * deletes objects, using whatever identity the SDK's default credential chain
 * resolves — the EC2 instance role in production, never an access key — and
 * `getUrl()` returns a CloudFront URL, because browsers only ever read media
 * through CloudFront (Origin Access Control), never from S3 directly.
 *
 * The object's `Cache-Control` is set at upload so CloudFront and browsers
 * cache the image for a year. The flip side: because keys are immutable and
 * cached that long, a deleted image can keep being served from CloudFront
 * edge caches until they expire — deletion removes the S3 object and the DB
 * row's availability, but does not purge the CDN (no invalidation is issued;
 * see docs/deployment.md, Media).
 *
 * No `ACL` is sent (the bucket enforces bucket-owner ownership and rejects
 * ACLs) and no server-side-encryption header is either: the bucket's default
 * encryption (SSE-S3) applies.
 */
export class S3MediaStorage implements MediaStoragePort {
  private readonly publicBaseUrl: string;

  constructor(private readonly config: S3MediaStorageConfig) {
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
  }

  async save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<SavedMedia> {
    const key = generateMediaKey(originalFilename, mimeType);
    try {
      await this.config.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ContentLength: buffer.length,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        }),
      );
    } catch (error) {
      logError("media_s3_upload_failed", { key, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    return { key, url: this.getUrl(key) };
  }

  /** S3 reports success for a key that no longer exists, so a retried delete is naturally idempotent. */
  async delete(key: string): Promise<void> {
    try {
      await this.config.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      logError("media_s3_delete_failed", { key, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  getUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
