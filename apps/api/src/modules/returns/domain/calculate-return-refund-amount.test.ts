import { describe, expect, it } from "vitest";
import { calculateReturnRefundAmount } from "./calculate-return-refund-amount";

describe("calculateReturnRefundAmount", () => {
  it("refunds the full line (price + tax) when the whole ordered quantity is returned", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 2 }]);
    expect(amount).toBe(2000 + 100); // 2×1000 price + the whole line's tax
  });

  it("prorates tax for a partial-quantity return", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 4, unitPricePaise: 1000, taxAmountPaise: 200 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 1 }]);
    expect(amount).toBe(1000 + 50); // 1×1000 price + 1/4 of the 200 tax
  });

  it("sums across multiple returned lines", () => {
    const items = [
      { orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100 },
      { orderItemId: "oi-2", orderedQuantity: 1, unitPricePaise: 5000, taxAmountPaise: 900 },
    ];
    const amount = calculateReturnRefundAmount(items, [
      { orderItemId: "oi-1", quantity: 1 },
      { orderItemId: "oi-2", quantity: 1 },
    ]);
    expect(amount).toBe(1000 + 50 + 5000 + 900);
  });

  it("ignores a line with no matching order item (defensive)", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 2, unitPricePaise: 1000, taxAmountPaise: 100 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "does-not-exist", quantity: 1 }]);
    expect(amount).toBe(0);
  });

  it("never includes a shipping fee — only price and tax", () => {
    const items = [{ orderItemId: "oi-1", orderedQuantity: 1, unitPricePaise: 1000, taxAmountPaise: 50 }];
    const amount = calculateReturnRefundAmount(items, [{ orderItemId: "oi-1", quantity: 1 }]);
    expect(amount).toBe(1050);
  });
});
