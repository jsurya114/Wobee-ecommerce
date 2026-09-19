import type { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { S3MediaStorage, type S3CommandSender } from "./s3-media-storage.service";

/** Records commands instead of talking to AWS — these tests need no credentials, network, or SDK mocking library. */
function fakeClient(failWith?: Error) {
  const sent: Array<PutObjectCommand | DeleteObjectCommand> = [];
  const client: S3CommandSender = {
    async send(command) {
      if (failWith) throw failWith;
      sent.push(command);
      return {};
    },
  };
  return { client, sent };
}

const BASE = "https://d111111abcdef8.cloudfront.net";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

afterEach(() => vi.restoreAllMocks());

describe("S3MediaStorage.save", () => {
  it("puts the object into the configured bucket with immutable caching and the right content type", async () => {
    const { client, sent } = fakeClient();
    const storage = new S3MediaStorage({ client, bucket: "media-bucket", publicBaseUrl: BASE });

    const saved = await storage.save(JPEG, "swatch.jpg", "image/jpeg");

    expect(sent).toHaveLength(1);
    const input = (sent[0] as PutObjectCommand).input;
    expect(input.Bucket).toBe("media-bucket");
    expect(input.Key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(input.Body).toBe(JPEG);
    expect(input.ContentType).toBe("image/jpeg");
    expect(input.ContentLength).toBe(JPEG.length);
    expect(input.CacheControl).toBe("public, max-age=31536000, immutable");
    expect(saved.key).toBe(input.Key);
  });

  it("never sets an ACL or an S3 URL — the bucket is private and only CloudFront serves it", async () => {
    const { client, sent } = fakeClient();
    const storage = new S3MediaStorage({ client, bucket: "media-bucket", publicBaseUrl: BASE });

    const saved = await storage.save(JPEG, "a.png", "image/png");

    expect((sent[0] as PutObjectCommand).input.ACL).toBeUndefined();
    expect(saved.url).toBe(`${BASE}/${saved.key}`);
    expect(saved.url).not.toContain("amazonaws.com");
  });

  it("gives every upload a distinct key", async () => {
    const { client } = fakeClient();
    const storage = new S3MediaStorage({ client, bucket: "b", publicBaseUrl: BASE });
    const keys = new Set([
      (await storage.save(JPEG, "x.jpg", "image/jpeg")).key,
      (await storage.save(JPEG, "x.jpg", "image/jpeg")).key,
    ]);
    expect(keys.size).toBe(2);
  });

  it("propagates a storage failure (so the upload is not recorded) and logs it without the file bytes", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient(new Error("AccessDenied"));
    const storage = new S3MediaStorage({ client, bucket: "b", publicBaseUrl: BASE });

    await expect(storage.save(JPEG, "x.jpg", "image/jpeg")).rejects.toThrow("AccessDenied");

    const logged = String(errorLog.mock.calls[0]?.[0]);
    expect(logged).toContain("media_s3_upload_failed");
    expect(logged).toContain("AccessDenied");
  });
});

describe("S3MediaStorage.delete", () => {
  it("deletes exactly that key from the configured bucket", async () => {
    const { client, sent } = fakeClient();
    const storage = new S3MediaStorage({ client, bucket: "media-bucket", publicBaseUrl: BASE });

    await storage.delete("abc.jpg");

    expect(sent).toHaveLength(1);
    expect((sent[0] as DeleteObjectCommand).input).toEqual({ Bucket: "media-bucket", Key: "abc.jpg" });
  });

  it("propagates a delete failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient(new Error("boom"));
    const storage = new S3MediaStorage({ client, bucket: "b", publicBaseUrl: BASE });

    await expect(storage.delete("abc.jpg")).rejects.toThrow("boom");
  });
});

describe("S3MediaStorage.getUrl", () => {
  it("joins the CloudFront base URL and key, tolerating trailing slashes", () => {
    const { client } = fakeClient();
    expect(new S3MediaStorage({ client, bucket: "b", publicBaseUrl: `${BASE}/` }).getUrl("k.webp")).toBe(`${BASE}/k.webp`);
    expect(new S3MediaStorage({ client, bucket: "b", publicBaseUrl: `${BASE}///` }).getUrl("k.webp")).toBe(`${BASE}/k.webp`);
  });

  it("URL-encodes unsafe characters in a key", () => {
    const { client } = fakeClient();
    expect(new S3MediaStorage({ client, bucket: "b", publicBaseUrl: BASE }).getUrl("a b#c.jpg")).toBe(`${BASE}/a%20b%23c.jpg`);
  });
});
