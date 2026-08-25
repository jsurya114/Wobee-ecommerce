import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("unknown route", () => {
  it("returns a structured 404", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/v1/auth/register", () => {
  it("rejects an invalid payload with 400 before reaching the (stubbed) controller", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid payload and reaches the Day 2 stub", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Asha Rao", email: "asha@example.com", password: "Passw0rd" });
    expect(res.status).toBe(501);
  });
});
