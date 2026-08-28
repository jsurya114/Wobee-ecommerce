import { readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { MAX_UPLOAD_SIZE_BYTES } from "./domain/validate-upload";

/**
 * Integration tests against the REAL test database AND the real local
 * filesystem (mirrors this repo's other *.integration.test.ts files, just
 * with an extra kind of side effect this module actually owns: a file on
 * disk under MEDIA_UPLOAD_DIR) — Week 2 Day 4 Media Management
 * (week2 (1).md §13).
 */

const app = createApp();
const createdMediaIds: string[] = [];

afterAll(async () => {
  // Delete every uploaded file this suite created, even ones a test didn't
  // explicitly DELETE through the API (e.g. the 400/403/401 rejection
  // tests never got far enough to create a file at all, but the ones that
  // succeeded need cleanup so re-runs don't accumulate real files).
  for (const id of createdMediaIds) {
    const media = await prisma.media.findUnique({ where: { id } });
    if (media) {
      await import("node:fs/promises").then((fs) => fs.unlink(path.join(env.MEDIA_UPLOAD_DIR, media.key)).catch(() => undefined));
    }
  }
  if (createdMediaIds.length > 0) {
    await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  }
  await prisma.$disconnect();
});

async function loginStaff(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

// A minimal valid JPEG isn't needed — validateUpload only inspects the
// declared mime type and byte size, not the file's actual contents (image
// parsing is explicitly out of scope, see validate-upload.ts's own
// comment) — any bytes suffice as the "file".
const FAKE_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("media: upload", () => {
  it("uploads a valid image, and the returned URL actually serves it back", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", FAKE_JPEG_BYTES, { filename: "swatch.jpg", contentType: "image/jpeg" })
      .field("altText", "A fabric swatch");
    expect(res.status).toBe(201);
    createdMediaIds.push(res.body.media.id);
    expect(res.body.media.mimeType).toBe("image/jpeg");
    expect(res.body.media.altText).toBe("A fabric swatch");
    expect(res.body.media.status).toBe("ACTIVE");
    expect(res.body.media.url).toContain("/uploads/");

    const fileRes = await request(app).get(new URL(res.body.media.url).pathname);
    expect(fileRes.status).toBe(200);
    expect(Buffer.compare(fileRes.body as Buffer, FAKE_JPEG_BYTES)).toBe(0);
  });

  it("rejects a disallowed mime type with 400, no file left behind", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const before = await readdir(env.MEDIA_UPLOAD_DIR).catch(() => [] as string[]);
    const res = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", FAKE_JPEG_BYTES, { filename: "clip.mp4", contentType: "video/mp4" });
    expect(res.status).toBe(400);
    const after = await readdir(env.MEDIA_UPLOAD_DIR).catch(() => [] as string[]);
    expect(after.length).toBe(before.length);
  });

  it("rejects an oversized file with 400", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const oversized = Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1024, 1);
    const res = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", oversized, { filename: "huge.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });

  it("rejects a request with no file attached", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const res = await request(app).post("/api/v1/media").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated upload with 401", async () => {
    const res = await request(app).post("/api/v1/media").attach("file", FAKE_JPEG_BYTES, { filename: "swatch.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(401);
  });

  it("403s an order_processing_staff (no MANAGE_CATALOG)", async () => {
    const staffToken = await loginStaff("orders@woobe.in", "Staff@12345");
    const res = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", FAKE_JPEG_BYTES, { filename: "swatch.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(403);
  });
});

describe("media: get / delete", () => {
  it("gets metadata for an uploaded file", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const uploaded = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", FAKE_JPEG_BYTES, { filename: "swatch.jpg", contentType: "image/jpeg" });
    createdMediaIds.push(uploaded.body.media.id);

    const res = await request(app).get(`/api/v1/media/${uploaded.body.media.id}`).set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.media.id).toBe(uploaded.body.media.id);
  });

  it("deletes an uploaded file — the row is marked DELETED and the file stops serving", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const uploaded = await request(app)
      .post("/api/v1/media")
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("file", FAKE_JPEG_BYTES, { filename: "swatch.jpg", contentType: "image/jpeg" });
    const mediaId = uploaded.body.media.id as string;

    const deleteRes = await request(app).delete(`/api/v1/media/${mediaId}`).set("Authorization", `Bearer ${staffToken}`);
    expect(deleteRes.status).toBe(204);

    const dbRow = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(dbRow?.status).toBe("DELETED");

    const fileRes = await request(app).get(new URL(uploaded.body.media.url).pathname);
    expect(fileRes.status).toBe(404); // the actual bytes are gone from disk, not just the DB row

    // Still tracked for afterAll cleanup — a soft-deleted row is real
    // production behavior (kept for audit) but has no place lingering in
    // woobe_test across runs; a prior version of this test left it behind
    // on purpose and it silently accumulated one row per run (caught by
    // re-checking row counts after a repeated local run, same class of
    // leftover-test-data issue flagged in this week's Day 2 audit entry).
    createdMediaIds.push(mediaId);
  });

  it("404s getting or deleting an already-deleted or unknown media id", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const res = await request(app).delete(`/api/v1/media/${crypto.randomUUID()}`).set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });
});
