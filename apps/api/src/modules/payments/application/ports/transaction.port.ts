/**
 * Unit-of-Work boundary for payment confirmation/failure — same pattern and
 * rationale as orders/application/ports/transaction.port.ts (this module
 * defines its own copy rather than importing that one, so each module's
 * application layer only ever depends on its own port shapes — the same
 * one-port-shape-per-module-pair convention used throughout, e.g. cart and
 * products each define their own PricingReaderPort even though the shape
 * is identical). Only payments/infrastructure ever starts a real
 * transaction with this; `tx` stays opaque to the application layer.
 */
export interface TransactionPort {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}
