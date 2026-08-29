import { describe, expect, it } from "vitest";
import { calculateReturnRefundAmount } from "./calculate-return-refund-amount";

describe("calculateReturnRefundAmount", () => {
  it("refunds the full line (price + tax) when the whole ordered quantity is returned", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100, discountPaise: 0 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 2 }]);
    expect(amount).toBe(2000 + 100); // 2×1000 price + the whole line's tax
  });

  it("prorates tax for a partial-quantity return", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 4, unitPricePaise: 1000, taxAmountPaise: 200, discountPaise: 0 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 1 }]);
    expect(amount).toBe(1000 + 50); // 1×1000 price + 1/4 of the 200 tax
  });

  it("sums across multiple returned lines", () => {
    const items = [
      { orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100, discountPaise: 0 },
      { orderItemId: "oi-2", orderedQuantity: 1, unitPricePaise: 5000, taxAmountPaise: 900, discountPaise: 0 },
    ];
    const amount = calculateReturnRefundAmount(items, [
      { orderItemId: "oi-1", quantity: 1 },
      { orderItemId: "oi-2", quantity: 1 },
    ]);
    expect(amount).toBe(1000 + 50 + 5000 + 900);
  });

  it("ignores a line with no matching order item (defensive)", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100, discountPaise: 0 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "does-not-exist", quantity: 1 }]);
    expect(amount).toBe(0);
  });

  it("never includes a shipping fee — only price and tax", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 1, unitPricePaise: 1000, taxAmountPaise: 50, discountPaise: 0 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 1 }]);
    expect(amount).toBe(1050);
  });

  // Week 2 review fix (P0) — a coupon-discounted line must refund what was PAID,
  // not the undiscounted unitPricePaise. Regression example straight from the
  // review: 5 units × ₹264.00 (26400 paise), WELCOME10 allocated 13200 paise to
  // the line, GST 5% on the discounted 118800 = 5940 (already the snapshot tax).
  it("subtracts the coupon discount so a full return refunds only what was paid", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 5, unitPricePaise: 26400, taxAmountPaise: 5940, discountPaise: 13200 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 5 }]);
    // 5×26400 gross − 13200 discount + 5940 tax = 124740 (= 118800 net goods + 5940 tax)
    expect(amount).toBe(132000 - 13200 + 5940);
    expect(amount).toBe(124740);
  });

  it("prorates the coupon discount for a partial-quantity return", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 4, unitPricePaise: 1000, taxAmountPaise: 160, discountPaise: 400 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 1 }]);
    // 1×1000 gross − round(400·1/4)=100 discount + round(160·1/4)=40 tax = 940
    expect(amount).toBe(1000 - 100 + 40);
  });
});
