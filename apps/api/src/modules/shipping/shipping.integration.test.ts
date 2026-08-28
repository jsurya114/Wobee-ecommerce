import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — week2 (1).md §10's
 * public `GET /shipping/estimate` (no auth required, same reasoning as
 * reviews' public GET). Reads the live seeded ShippingRule rather than
 * hardcoding its estimatedDeliveryDays* values, same pattern orders'
 * checkout integration test uses for pricing/GST/shipping fee.
 */

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /shipping/estimate", () => {
  it("returns serviceable + the live delivery estimate for a well-formed pincode", async () => {
    const rule = await prisma.shippingRule.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });

    const res = await request(app).get("/api/v1/shipping/estimate").query({ pincode: "560001" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      serviceable: true,
      estimatedDeliveryDaysMin: rule.estimatedDeliveryDaysMin,
      estimatedDeliveryDaysMax: rule.estimatedDeliveryDaysMax,
    });
  });

  it("rejects a malformed pincode as not serviceable, with a reason and no delivery estimate", async () => {
    const res = await request(app).get("/api/v1/shipping/estimate").query({ pincode: "12AB56" });

    expect(res.status).toBe(200);
    expect(res.body.serviceable).toBe(false);
    expect(res.body.reason).toMatch(/valid 6-digit pincode/i);
    expect(res.body.estimatedDeliveryDaysMin).toBeUndefined();
  });

  it("rejects a request missing the pincode query param with a 400", async () => {
    const res = await request(app).get("/api/v1/shipping/estimate");
    expect(res.status).toBe(400);
  });
});
