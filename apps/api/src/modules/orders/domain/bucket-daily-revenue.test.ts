import { describe, expect, it } from "vitest";
import { bucketDailyRevenue } from "./bucket-daily-revenue";

describe("bucketDailyRevenue", () => {
  it("fills every day in the range, including zero-revenue days", () => {
    const range = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 3)) };
    const result = bucketDailyRevenue(range, []);
    expect(result).toEqual([
      { date: "2026-09-01", revenuePaise: 0, orderCount: 0 },
      { date: "2026-09-02", revenuePaise: 0, orderCount: 0 },
      { date: "2026-09-03", revenuePaise: 0, orderCount: 0 },
    ]);
  });

  it("sums multiple orders into the same day's bucket", () => {
    const range = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 1)) };
    const orders = [
      { placedAt: new Date(Date.UTC(2026, 8, 1, 3)), totalPaise: 1000 },
      { placedAt: new Date(Date.UTC(2026, 8, 1, 20)), totalPaise: 500 },
    ];
    const result = bucketDailyRevenue(range, orders);
    expect(result).toEqual([{ date: "2026-09-01", revenuePaise: 1500, orderCount: 2 }]);
  });

  it("keeps separate days separate, in range order", () => {
    const range = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 2)) };
    const orders = [
      { placedAt: new Date(Date.UTC(2026, 8, 2, 1)), totalPaise: 200 },
      { placedAt: new Date(Date.UTC(2026, 8, 1, 1)), totalPaise: 100 },
    ];
    const result = bucketDailyRevenue(range, orders);
    expect(result).toEqual([
      { date: "2026-09-01", revenuePaise: 100, orderCount: 1 },
      { date: "2026-09-02", revenuePaise: 200, orderCount: 1 },
    ]);
  });

  it("ignores an order outside the bucketed range rather than throwing", () => {
    const range = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 1)) };
    const orders = [{ placedAt: new Date(Date.UTC(2026, 7, 15)), totalPaise: 999 }];
    const result = bucketDailyRevenue(range, orders);
    expect(result).toEqual([{ date: "2026-09-01", revenuePaise: 0, orderCount: 0 }]);
  });
});
