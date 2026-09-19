import { describe, expect, it } from "vitest";
import { createMediaStorage } from "./create-media-storage";
import { LocalDiskMediaStorage } from "./local-disk-media-storage.service";
import { S3MediaStorage } from "./s3-media-storage.service";

describe("createMediaStorage", () => {
  it("returns the local-disk implementation for the local driver", () => {
    expect(createMediaStorage({ MEDIA_STORAGE_DRIVER: "local" })).toBeInstanceOf(LocalDiskMediaStorage);
  });

  it("returns the S3 implementation for the s3 driver, building CloudFront URLs — with no AWS credentials or network involved", () => {
    const storage = createMediaStorage({
      MEDIA_STORAGE_DRIVER: "s3",
      AWS_REGION: "ap-south-2",
      MEDIA_S3_BUCKET: "media-bucket",
      MEDIA_PUBLIC_BASE_URL: "https://d111111abcdef8.cloudfront.net",
    });
    expect(storage).toBeInstanceOf(S3MediaStorage);
    expect(storage.getUrl("k.jpg")).toBe("https://d111111abcdef8.cloudfront.net/k.jpg");
  });

  it.each(["AWS_REGION", "MEDIA_S3_BUCKET", "MEDIA_PUBLIC_BASE_URL"] as const)("refuses the s3 driver without %s", (missing) => {
    const settings = {
      MEDIA_STORAGE_DRIVER: "s3" as const,
      AWS_REGION: "ap-south-2",
      MEDIA_S3_BUCKET: "media-bucket",
      MEDIA_PUBLIC_BASE_URL: "https://d111111abcdef8.cloudfront.net",
      [missing]: undefined,
    };
    expect(() => createMediaStorage(settings)).toThrow(/requires AWS_REGION, MEDIA_S3_BUCKET and MEDIA_PUBLIC_BASE_URL/);
  });
});
