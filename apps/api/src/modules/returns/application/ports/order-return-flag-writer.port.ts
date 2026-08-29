/**
 * Narrow write port onto `orders`' `Order.hasActiveReturn` (schema.prisma's
 * own comment: "Denormalized for admin filtering only — the real state
 * lives on Return"). `returns` never writes to the Order table directly
 * (ADR-010) — this is the one field of it this module is allowed to
 * influence, through `orders`' own exported use-case.
 */
export interface OrderReturnFlagWriterPort {
  setHasActiveReturn(orderId: string, value: boolean): Promise<void>;
}
