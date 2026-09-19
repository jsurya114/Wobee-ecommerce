import { S3Client } from "@aws-sdk/client-s3";
import type { MediaStoragePort } from "../../application/ports/media-storage.port";
import { LocalDiskMediaStorage } from "./local-disk-media-storage.service";
import { S3MediaStorage } from "./s3-media-storage.service";

export interface MediaStorageSettings {
  MEDIA_STORAGE_DRIVER: "local" | "s3";
  AWS_REGION?: string;
  MEDIA_S3_BUCKET?: string;
  MEDIA_PUBLIC_BASE_URL?: string;
}

/**
 * Picks the MediaStoragePort implementation from configuration — the one
 * place that knows there is more than one. `config/env.ts` already refuses to
 * boot in production without `s3` and its three settings; the check here is
 * defense in depth for direct callers.
 *
 * No credentials are passed to the S3 client on purpose: the SDK's default
 * provider chain picks up the EC2 instance role (IMDSv2) in production.
 */
export function createMediaStorage(settings: MediaStorageSettings): MediaStoragePort {
  if (settings.MEDIA_STORAGE_DRIVER === "local") {
    return new LocalDiskMediaStorage();
  }

  const { AWS_REGION, MEDIA_S3_BUCKET, MEDIA_PUBLIC_BASE_URL } = settings;
  if (!AWS_REGION || !MEDIA_S3_BUCKET || !MEDIA_PUBLIC_BASE_URL) {
    throw new Error("MEDIA_STORAGE_DRIVER=s3 requires AWS_REGION, MEDIA_S3_BUCKET and MEDIA_PUBLIC_BASE_URL");
  }

  return new S3MediaStorage({
    client: new S3Client({ region: AWS_REGION }),
    bucket: MEDIA_S3_BUCKET,
    publicBaseUrl: MEDIA_PUBLIC_BASE_URL,
  });
}
