import { describe, expect, it } from "vitest";
import { isGuestCheckoutEmailConfirmed } from "./ensure-guest-checkout-email-confirmed";

describe("isGuestCheckoutEmailConfirmed", () => {
  it("passes a logged-in checkout regardless of confirmEmail (not required at all)", () => {
    expect(isGuestCheckoutEmailConfirmed({ isGuest: false, contactEmail: "a@a.com", confirmEmail: undefined })).toBe(true);
    expect(isGuestCheckoutEmailConfirmed({ isGuest: false, contactEmail: "a@a.com", confirmEmail: "different@a.com" })).toBe(true);
  });

  it("passes a guest checkout when confirmEmail matches contactEmail exactly", () => {
    expect(isGuestCheckoutEmailConfirmed({ isGuest: true, contactEmail: "a@a.com", confirmEmail: "a@a.com" })).toBe(true);
  });

  it("rejects a guest checkout with no confirmEmail", () => {
    expect(isGuestCheckoutEmailConfirmed({ isGuest: true, contactEmail: "a@a.com", confirmEmail: undefined })).toBe(false);
  });

  it("rejects a guest checkout whose confirmEmail doesn't match", () => {
    expect(isGuestCheckoutEmailConfirmed({ isGuest: true, contactEmail: "a@a.com", confirmEmail: "b@a.com" })).toBe(false);
  });
});
