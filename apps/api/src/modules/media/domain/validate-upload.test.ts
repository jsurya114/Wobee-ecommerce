import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_SIZE_BYTES, validateUpload } from "./validate-upload";

describe("validateUpload", () => {
  it("accepts an allowed image type within the size limit", () => {
    expect(validateUpload("image/jpeg", 1024)).toEqual({ ok: true });
    expect(validateUpload("image/png", 1024)).toEqual({ ok: true });
    expect(validateUpload("image/webp", 1024)).toEqual({ ok: true });
  });

  it("rejects a disallowed mime type", () => {
    const result = validateUpload("image/gif", 1024);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported file type/i);
  });

  it("rejects video even though it's a real, common format", () => {
    const result = validateUpload("video/mp4", 1024);
    expect(result.ok).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    const result = validateUpload("image/jpeg", 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects a file over the size limit", () => {
    const result = validateUpload("image/jpeg", MAX_UPLOAD_SIZE_BYTES + 1);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validateUpload("image/jpeg", MAX_UPLOAD_SIZE_BYTES)).toEqual({ ok: true });
  });
});
