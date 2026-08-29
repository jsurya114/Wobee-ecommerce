/**
 * Internal retry signal only — never reaches a controller/HTTP response.
 * `orderNumber` collisions are astronomically unlikely (see order-number.ts)
 * but not impossible; the repository throws this specifically so the
 * checkout use-case can regenerate and retry instead of failing the whole
 * checkout on a fluke.
 */
export class OrderNumberCollisionError extends Error {
  constructor() {
    super("Order number collision");
    this.name = "OrderNumberCollisionError";
  }
}
