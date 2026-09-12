import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, renderPasswordResetOtpEmail, renderRegistrationOtpEmail } from "./index";
import type { NotificationEventType } from "../../../modules/notifications/domain/entities/notification.entity";

/** No template output should ever leak an unrendered value. */
function assertNoLeaks(...blobs: string[]): void {
  for (const blob of blobs) {
    expect(blob).not.toMatch(/undefined|NaN|\[object Object\]/);
  }
}

describe("email templates — every queue event has a defensive renderer", () => {
  const events = Object.keys(EMAIL_TEMPLATES) as NotificationEventType[];

  it("renders subject + html + text for every event with a full payload", () => {
    for (const type of events) {
      const out = EMAIL_TEMPLATES[type]({
        contactEmail: "c@example.com",
        contactName: "Asha",
        name: "Asha",
        orderNumber: "WOOBE-20260910-ABC",
        paymentMethod: "RAZORPAY",
        paymentStatus: "PAID",
        items: [{ name: "Ribbed Knit Sweater", color: "Oatmeal", size: "S", quantity: 2, unitPricePaise: 74400, lineTotalPaise: 148800 }],
        subtotalPaise: 148800,
        discountPaise: 14880,
        shippingFeePaise: 5000,
        taxPaise: 6696,
        totalPaise: 145616,
        shippingAddress: { fullName: "Asha", phone: "9876543210", line1: "1 MG Road", city: "Kochi", state: "Kerala", pincode: "682001" },
        trackingNumber: "TRK123",
        carrier: "BlueDart",
        returnId: "ret-1",
        itemCount: 2,
        amountPaise: 145616,
        refundIssued: true,
        cancellationReason: "Customer changed mind",
        reason: "Outside the return window",
      });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain("<html");
      expect(out.text.length).toBeGreaterThan(0);
      assertNoLeaks(out.subject, out.html, out.text);
    }
  });

  it("degrades gracefully when every optional field is absent (only contactEmail present)", () => {
    for (const type of events) {
      const out = EMAIL_TEMPLATES[type]({ contactEmail: "c@example.com" });
      expect(out.subject.length).toBeGreaterThan(0);
      assertNoLeaks(out.subject, out.html, out.text);
    }
  });

  it("order-confirmed invoice carries every figure in both html and text", () => {
    const payload = {
      contactEmail: "c@example.com",
      contactName: "Asha",
      orderNumber: "WOOBE-1",
      paymentMethod: "COD",
      paymentStatus: "PAY_ON_DELIVERY",
      items: [{ name: "Denim Jacket", color: "Indigo", size: "L", quantity: 1, unitPricePaise: 250000, lineTotalPaise: 250000 }],
      subtotalPaise: 250000,
      discountPaise: 25000,
      shippingFeePaise: 0,
      taxPaise: 11250,
      totalPaise: 236250,
      shippingAddress: { fullName: "Asha", phone: "9876543210", line1: "1 MG Road", city: "Kochi", state: "Kerala", pincode: "682001" },
    };
    const out = EMAIL_TEMPLATES.ORDER_CONFIRMED(payload);
    expect(out.subject).toBe("Order #WOOBE-1 confirmed");
    for (const blob of [out.html, out.text]) {
      expect(blob).toContain("Denim Jacket");
      expect(blob).toContain("₹2,500.00"); // subtotal / unit
      expect(blob).toContain("₹250.00"); // discount
      expect(blob).toContain("Free"); // shipping
      expect(blob).toContain("₹112.50"); // tax
      expect(blob).toContain("₹2,362.50"); // total
      expect(blob).toContain("Kochi");
      expect(blob).toMatch(/Pay on delivery/i);
    }
  });

  it("order-shipped shows tracking only when present", () => {
    const withTracking = EMAIL_TEMPLATES.ORDER_SHIPPED({ contactEmail: "c@x.com", orderNumber: "O1", carrier: "BlueDart", trackingNumber: "T9" });
    expect(withTracking.html).toContain("BlueDart");
    expect(withTracking.html).toContain("T9");
    const without = EMAIL_TEMPLATES.ORDER_SHIPPED({ contactEmail: "c@x.com", orderNumber: "O1" });
    expect(without.html).not.toMatch(/Tracking number/i);
    assertNoLeaks(without.html, without.text);
  });

  it("cancellation email never claims a refund is complete", () => {
    const out = EMAIL_TEMPLATES.ORDER_CANCELLED({ contactEmail: "c@x.com", orderNumber: "O1", refundIssued: true });
    expect(out.text).toMatch(/refund has been initiated/i);
    expect(out.text).not.toMatch(/refund.*(completed|complete)/i);
  });

  it("refund-initiated and refund-completed are semantically distinct", () => {
    const initiated = EMAIL_TEMPLATES.REFUND_INITIATED({ contactEmail: "c@x.com", orderNumber: "O1", amountPaise: 50000 });
    const completed = EMAIL_TEMPLATES.REFUND_COMPLETED({ contactEmail: "c@x.com", orderNumber: "O1", amountPaise: 50000 });
    expect(initiated.subject).toMatch(/initiated/i);
    expect(completed.subject).toMatch(/completed/i);
    expect(initiated.text).toContain("₹500.00");
  });
});

describe("OTP email templates (synchronous auth path)", () => {
  it("registration OTP puts the code in the subject and both bodies", () => {
    const out = renderRegistrationOtpEmail({ code: "4821", expiresMinutes: 5 });
    expect(out.subject).toBe("4821 is your Woobe verification code");
    expect(out.html).toContain("4821");
    expect(out.text).toContain("4821");
    expect(out.text).toContain("5 minutes");
  });

  it("password reset OTP has reset-specific copy", () => {
    const out = renderPasswordResetOtpEmail({ code: "1234", expiresMinutes: 5 });
    expect(out.subject).toBe("1234 is your Woobe password reset code");
    expect(out.html).toMatch(/reset your Woobe password/i);
    expect(out.text).toContain("1234");
  });
});
