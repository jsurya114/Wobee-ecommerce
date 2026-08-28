export interface CreateShipmentInput {
  orderId: string;
  trackingNumber: string;
  carrier: string;
}

export interface ShipmentResult {
  trackingNumber: string;
  carrier: string;
  /** Which provider actually created this — "MANUAL" today (no courier API is approved/configured), a real carrier's name once one is. */
  provider: string;
}

/**
 * Week 2 Day 5 (week2 (1).md §10's own `ShippingService.createShipment()`
 * ask). Provider-independent by design — a real courier API (Delhivery,
 * Shiprocket, etc.) is a second class implementing this same interface
 * later, nothing above this layer would change.
 */
export interface ShippingProviderPort {
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
}
