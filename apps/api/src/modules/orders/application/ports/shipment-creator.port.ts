/** Narrow port onto `shipping` (Week 2 Day 5, week2 (1).md §10's `ShippingService.createShipment()`) — wired in orders.module.ts to a one-line pass-through, same pattern ShippingReaderPort already uses. */
export interface ShipmentCreatorPort {
  createShipment(input: { orderId: string; trackingNumber: string; carrier: string }): Promise<{ trackingNumber: string; carrier: string }>;
}
