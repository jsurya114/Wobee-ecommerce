import { describe, expect, it } from "vitest";
import { COURIERS, COURIER_CODES, resolveCourier } from "./couriers";
import { shipOrderSchema } from "./admin.schema";

describe("couriers", () => {
  it("has a preset for every code and every page is https", () => {
    for (const code of COURIER_CODES) {
      expect(COURIERS[code].code).toBe(code);
      const url = COURIERS[code].trackingPageUrl;
      if (url) expect(url).toMatch(/^https:\/\//);
    }
  });

  it("link precedence: explicit > deep link > courier page; OTHER keeps the typed name", () => {
    expect(resolveCourier({ carrierCode: "DTDC", trackingNumber: "1", trackingUrl: "https://x.test/1" }).trackingUrl).toBe("https://x.test/1");
    expect(resolveCourier({ carrierCode: "DTDC", trackingNumber: "1" })).toMatchObject({ code: "DTDC", name: "DTDC", trackingUrl: "https://www.dtdc.com/" });
    expect(resolveCourier({ carrierCode: "OTHER", carrier: " Kerala Express ", trackingNumber: "1" })).toEqual({ code: "OTHER", name: "Kerala Express", trackingUrl: null });
    expect(resolveCourier({ carrier: "Legacy", trackingNumber: "1" })).toEqual({ code: null, name: "Legacy", trackingUrl: null });
    expect(resolveCourier({ carrierCode: "ANJANI", trackingNumber: "1" }).trackingUrl).toBeNull();
  });
});

describe("shipOrderSchema", () => {
  it("accepts a preset without a free-text carrier, requires one for OTHER or legacy", () => {
    expect(shipOrderSchema.safeParse({ trackingNumber: "T", carrierCode: "EKART" }).success).toBe(true);
    expect(shipOrderSchema.safeParse({ trackingNumber: "T", carrierCode: "OTHER" }).success).toBe(false);
    expect(shipOrderSchema.safeParse({ trackingNumber: "T" }).success).toBe(false);
    expect(shipOrderSchema.safeParse({ trackingNumber: "T", carrier: "Legacy" }).success).toBe(true);
  });
  it("rejects non-http tracking links", () => {
    expect(shipOrderSchema.safeParse({ trackingNumber: "T", carrierCode: "EKART", trackingUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
